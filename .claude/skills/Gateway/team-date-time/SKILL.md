---
name: team-date-time
description: >
  How the Gateway supplies team time to every downstream service. Use whenever touching the
  Intowork.TeamTimeZone, Intowork.TeamDateFormat or Intowork.TeamTimeFormat headers, the
  intowork_team_time_zone / intowork_team_date_format / intowork_team_time_format claims, TeamTimeResolver,
  TeamTimeClaims, TeamTimeValues, IntoworkAuthInjector, the Ocelot header transformation (Ingress.cs,
  ConfigBuilder), the selected-team override, the TeamCreated / TeamUpdated handlers, or any change that could
  alter which time zone a downstream service sees. Also trigger on "time zone", "timezone", "London", "UTC",
  "team time" and "400 Team time zone required".
---

# Team date and time (Gateway)

The Gateway does not do date maths. Its job is to put **the caller's team zone and formats** on every
downstream request, truthfully, so that the services can apply the rule: the zone comes only from the
`Intowork.TeamTimeZone` header, and a service that does not get a valid one answers 400. This skill is what must
not break on the Gateway side.

## The contract with the services

| Header sent downstream | Claim it is mapped from | Value |
|---|---|---|
| `Intowork.TeamTimeZone` | `intowork_team_time_zone` | The team's IANA zone id, or an **empty string** |
| `Intowork.TeamDateFormat` | `intowork_team_date_format` | The team's date format, default `dd/MM/yyyy` |
| `Intowork.TeamTimeFormat` | `intowork_team_time_format` | The team's time format, default `HH:mm` |

Services read these in `HeaderRequestInfo`: an empty or unknown zone throws `TeamTimeHeaderMissingException`, which
`TeamTimeHeaderMissingFilter` turns into a **400** titled "Team time zone required". Formats fall back to the same
two defaults in the service, so only the zone is strict.

**The Gateway sends an empty zone, never London and never UTC**, when it cannot give the real one. That is on
purpose: a guessed zone would shift every day boundary in every service without anybody noticing. An empty zone
makes the service refuse the request, which is visible and fixable.

## Where it lives

| What | Path |
|---|---|
| Claim names, `All`, `DefaultValueOf` | `Intowork.Gateway/Time/TeamTimeClaims.cs` (`IntoworkGateway.TeamTime.TeamTimeClaims`) |
| `TeamTimeValues(TimeZone, DateFormat, TimeFormat)` and `WithoutZone` (`""`, `dd/MM/yyyy`, `HH:mm`) | `Intowork.Gateway/Time/TeamTimeValues.cs` (`Intowork.Gateway.Time`) |
| Turns a `Team` into `TeamTimeValues`; validates the zone; logs once per team | `Intowork.Gateway/Time/TeamTimeResolver.cs` |
| Fills / replaces the claims: `SetTeamTimeClaims`, `AddMissingHeaderClaims`, `HeaderMappedClaims`, `AddDummyPreflightValues` | `Intowork.Gateway/Auth/IntoworkAuthInjector.cs` |
| Claim to header mapping (`Claims[intowork_team_time_zone] > value` and the two siblings) | `Intowork.Gateway.Core/Data/Models/Ingress.cs` (`HeaderTransformation`), consumed by `Intowork.Gateway/Config/ConfigBuilder.cs` |
| Strips every client-supplied `Intowork.*` header | `Intowork.Gateway/Middleware/IntoworkHeaderStrippingMiddleware.cs` |
| Replaces team claims when the user picked another team (`X-Selected-Team`) | `Intowork.Gateway/Middleware/IntoworkTeamOverrideMiddleware.cs`, `docs/auth-flow.md` section 3b |
| Keeps the team copy (zone, formats) current | `Intowork.Gateway.Background/Events/Handlers/TeamCreatedHandler.cs`, `TeamUpdatedHandler.cs` |
| Tests | `Intowork.Gateway.Tests/Auth/IntoworkAuthInjectorTests.cs`, `HeaderTransformationContractTests.cs`; `Intowork.Gateway.Background.Tests/Events/Handlers/TeamTimeSettingsHandlerTests.cs` |

## How a request gets its headers

1. The JWT is validated; the caller is either a team (staff) user or a customer user.
2. `IntoworkAuthInjector` loads the team settings with `ITeamsRepo.GetTeamSettingsAsync(teamName, ...)`. A failure
   to load is logged and treated as "no team settings".
3. `SetTeamTimeClaims` asks `TeamTimeResolver.For(team)` and **replaces** the three claims on the identity
   (`ReplaceClaim`, not `AddClaim`, because Ocelot's claim-to-header step takes the **first** claim of a type, so a
   token-supplied value would otherwise win).
4. `TeamTimeResolver` returns the stored zone only if `TimeZoneInfo.TryFindSystemTimeZoneById` accepts it. A null team,
   an empty zone and an unknown zone all give `TeamTimeValues.WithoutZone.TimeZone`, which is the empty string. Each
   case logs one warning per team (and per bad id), saying that services needing the zone will refuse the request.
   Formats use the team value or the default when blank.
5. Customer users have no team: `SetTeamTimeClaims(ci, null)` runs, so they get an empty zone and default formats.
6. When the user selected another team, the override path calls `SetTeamTimeClaims` with the **selected** team's
   settings, so the zone always matches the team the request acts in.
7. `AddMissingHeaderClaims` gives every claim in `HeaderMappedClaims` an empty placeholder (via
   `TeamTimeClaims.DefaultValueOf`) when the token lacks it. Ocelot **fails a route whose mapped claim is absent**, so a
   missing claim would be a 500 instead of a clean 400 downstream. `AddDummyPreflightValues` does the same for CORS
   preflight.
8. Ocelot maps the claims to the headers; the services see them.

Clients cannot choose their zone: `IntoworkHeaderStrippingMiddleware` deletes any incoming header that starts with
`Intowork.` before Ocelot runs (the test `AClientSentTeamTimeZoneHeaderIsStrippedBeforeTheTeamValueIsAdded` covers
`Intowork.TeamTimeZone`). The only client header that influences the team is `X-Selected-Team`, and it is validated
against the user's membership first.

## Rules

- Keep sending an **empty** zone when the team has none or an invalid one. Never substitute London, UTC or any
  other value, in the resolver, the injector or the config.
- Validate zone ids with `TimeZoneInfo.TryFindSystemTimeZoneById` (as `TeamTimeResolver` does, cached). Do not
  invent a second validation.
- Date and time formats keep their defaults `dd/MM/yyyy` and `HH:mm`.
- Any new header-mapped claim needs all of: an entry in `Ingress.cs`, an entry in `HeaderMappedClaims`, a default in
  `TeamTimeClaims.DefaultValueOf` (or the equivalent), a placeholder in `AddDummyPreflightValues`, and a test.
- Replace claims, never add duplicates; the tests assert there is a single claim of each type.
- `TeamCreated` and `TeamUpdated` handlers must copy `TimeZone`, `DateFormat` and `TimeFormat` from the event onto the
  Gateway's team copy. If the copy lacks the zone the services will all answer 400 for that team.
- Do not log the caller's token or claims when logging time problems; log the team name and the zone id only.
- Do not do date maths, formatting or conversion in the Gateway.

## Tests to keep green

- `IntoworkAuthInjectorTests`: the team-time claims are set by the injector, a placeholder is used for preflight, and
  there is a single claim of each type.
- `HeaderTransformationContractTests`: `Intowork.TeamTimeZone` maps from `intowork_team_time_zone`, the generated
  Ocelot config contains the header, and a client-sent `Intowork.TeamTimeZone` is stripped.
- `TeamTimeSettingsHandlerTests` (Background): `TeamCreated` and `TeamUpdated` copy zone and formats.

Run tests from inside `Gateway/`: `dotnet test IntoworkGateway.sln`.

## Do

- Treat the Gateway as the only source of the header and keep it truthful.
- Add a test with an unknown zone id and a null team whenever you touch `TeamTimeResolver`.
- Make a missing zone loud downstream (empty header, 400), never quiet.

## Don't

- Don't default to London or UTC, in code, config, helm values or tests.
- Don't forward a client-supplied `Intowork.*` header.
- Don't read the zone from the request body or query string.
- Don't use `AddClaim` where `ReplaceClaim` is needed.
- Don't add comments.

## Mistakes this work already fixed

- The Gateway used to send London when the team had no zone, which hid zone-less teams and moved their day
  boundaries; it now sends an empty zone and logs a warning once per team.
