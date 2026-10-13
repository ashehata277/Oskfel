# Merge conflicts to resolve before the PRs can target develop

Each section is a dry-run merge of `origin/develop` into the branch `feature/1.6.0/team-zone-headers`, taken on 2026-10-08. Nothing was changed in any repo.

In every hunk, **develop** is what is on `develop` now and **team-zone** is this feature branch. Keep the behaviour of both: the branch adds team time zone / date format / time format and the clock; develop adds its own newer changes.

To resolve in a repo: `git checkout feature/1.6.0/team-zone-headers && git merge origin/develop`, fix the files below, build, run the tests, then push.

## Gateway (PR 11009): 3 file(s)

### `Intowork.Gateway.Background/Events/Handlers/TeamCreatedHandler.cs`

develop:

```csharp
                Plan = teamCreated.Plan
```

team-zone:

```csharp
                TimeZone = teamCreated.TimeZone,
                DateFormat = teamCreated.DateFormat,
                TimeFormat = teamCreated.TimeFormat
```

### `Intowork.Gateway.Background/Events/Handlers/TeamUpdatedHandler.cs`

develop:

```csharp
                    Plan = teamUpdated.Plan
```

team-zone:

```csharp
                    TimeZone = teamUpdated.TimeZone,
                    DateFormat = teamUpdated.DateFormat,
                    TimeFormat = teamUpdated.TimeFormat
```

### `Intowork.Gateway.Background/Events/Integration/TeamUpdated.cs`

develop:

```csharp
        public TeamPlan Plan { get; set; }
```

team-zone:

```csharp
        public string TimeZone { get; set; }
        public string DateFormat { get; set; }
        public string TimeFormat { get; set; }
```

## ProjectService (PR 11010): 14 file(s)

### `Intowork.Core/Commands/UpdateTeamSettingsCommand.cs`

**Hunk 1 of 3**

develop:

```csharp

```

team-zone:

```csharp
        public bool ShowWorkReadyStatus { get; }
        public string TimeZone { get; }
        public string DateFormat { get; }
        public string TimeFormat { get; }
```

**Hunk 2 of 3**

develop:

```csharp
            decimal erectValuationrate, decimal strikeValuationrate, List<Qualification> qualifications, decimal vatMultiplier, string testEmails, string defaultInactiveStaffEmail, bool showAdvancedPricingColumns, int defaultGeofenceRadius,bool observeBankHolidays, List<DocumentCategory> documentCategories, HeadOfficeLocation headOfficeLocation, bool showWorkReadyStatus, DocumentDefaults documentDefaults = null) : base(teamName, performedId)
```

team-zone:

```csharp
            decimal erectValuationrate, decimal strikeValuationrate, List<Qualification> qualifications, decimal vatMultiplier, string testEmails, string defaultInactiveStaffEmail, bool showAdvancedPricingColumns, int defaultGeofenceRadius,bool observeBankHolidays, List<DocumentCategory> documentCategories, HeadOfficeLocation headOfficeLocation, bool showWorkReadyStatus,
            string timeZone = null, string dateFormat = null, string timeFormat = null) : base(teamName, performedId)
```

**Hunk 3 of 3**

develop:

```csharp
            DocumentDefaults = documentDefaults;
```

team-zone:

```csharp
            TimeZone = timeZone;
            DateFormat = dateFormat;
            TimeFormat = timeFormat;
```

### `Intowork.Core/Events/Integration/TeamCreated.cs`

develop:

```csharp
        public TeamPlan Plan { get; set; }
        public DocumentDefaults DocumentDefaults { get; set; }
        public bool IsEarlyAdopter { get; set; }
```

team-zone:

```csharp
        public string TimeZone { get; set; }
        public string DateFormat { get; set; }
        public string TimeFormat { get; set; }
```

### `Intowork.Core/Events/Integration/TeamUpdated.cs`

develop:

```csharp
        public bool IsEarlyAdopter { get; set; }
        public TeamPlan Plan { get; set; }
        /// <summary>Consumers that render documents (Handovers, Inspections) copy this beside TeamLogo and CompanyInformation.</summary>
        public DocumentDefaults DocumentDefaults { get; set; }
```

team-zone:

```csharp
        public string TimeZone { get; set; }
        public string DateFormat { get; set; }
        public string TimeFormat { get; set; }
```

### `Intowork.Core/Handlers/CommandHandlers/CreateTeamSettingsHandler.cs`

**Hunk 1 of 2**

develop:

```csharp
                    teamSetting.DocumentDefaults = DocumentDefaults.Default();
```

team-zone:

```csharp
                    teamSetting.TimeZone = request.TeamSettings.TimeZone;
                    teamSetting.DateFormat = request.TeamSettings.DateFormat;
                    teamSetting.TimeFormat = request.TeamSettings.TimeFormat;
                    TeamTimeRules.ApplyDefaults(teamSetting, _timeOptions.CurrentValue);
```

**Hunk 2 of 2**

develop:

```csharp
                        SessionId = request.PerformerId.ToString(),
                        Plan = teamSetting.Plan ?? TeamPlan.professional,
                        DocumentDefaults = teamSetting.DocumentDefaults,
                        IsEarlyAdopter = teamSetting.IsEarlyAdopter,
```

team-zone:

```csharp
                        TimeZone = teamSetting.TimeZone,
                        DateFormat = teamSetting.DateFormat,
                        TimeFormat = teamSetting.TimeFormat,
                        SessionId = request.PerformerId.ToString()
```

### `Intowork.Core/Handlers/CommandHandlers/EditTeamSettingsHandler.cs`

develop:

```csharp
                        Plan = team.Plan ?? TeamPlan.professional,
                        IsEarlyAdopter = teamSetting.IsEarlyAdopter,
```

team-zone:

```csharp
                        TimeZone = team.TimeZone,
                        DateFormat = teamSetting.DateFormat ?? team.DateFormat,
                        TimeFormat = teamSetting.TimeFormat ?? team.TimeFormat,
```

### `Intowork.Core/Handlers/CommandHandlers/UpdateTeamSettingsHandler.cs`

develop:

```csharp
                   
                    var outboundEvent = TeamUpdated.FromTeam(team, request.PerformerId.ToString());
```

team-zone:

```csharp
                    var outboundEvent = new TeamUpdated()
                    {
                        TeamName = request.TeamName,
                        TeamDisplayName = request.TeamDisplayName,
                        TeamAdminEmail = team.TeamAdminEmail,
                        TeamType = team.TeamType,
                        TestEmails = team.TestEmails,
                        DefaultInactiveStaffEmail = team.DefaultInactiveStaffEmail,
                        GooglePlacesAPIKey = team.GooglePlacesAPIKey,
                        AllowRemoteSignOut = team.AllowRemoteSignOut,
                        AllowRemoteSignIn = team.AllowRemoteSignIn,
                        SignInToAssignedWorkOnly = team.SignInToAssignedWorkOnly,
                        AllowOfflineSignInOut = team.AllowOfflineSignInOut,
                        AllowAutoSignOut = team.AllowAutoSignOut,
                        ObserveBankHolidays = team.ObserveBankHolidays,
                        IsActive = team.IsActive,
                        PerformerId = request.PerformerId.ToString(),
                        TeamLogo = request.TeamLogo,
                        SimplePricing = team.SimplePricing,
                        PricingVersion = team.PricingVersion,
                        LicenseType = team.LicenseType,
                        AcceptanceWorkflow = team.AcceptanceWorkflow,
                        LabourMarkup = team.LabourMarkup,
                        ContractorNetLabourPercent = team.ContractorNetLabourPercent,
                        ContractorGrossMarkupPercent = team.ContractorGrossMarkupPercent,
                        AgencyGrossMarkupPercent = team.AgencyGrossMarkupPercent,
                        CompanyInformation = team.CompanyInformation,
                        SubscriptionInformation = team.SubscriptionInformation,
                        JobSecureDefaults = team.JobSecureDefaults,
                        PlantHireDefaults = team.PlantHireDefaults,
                        WageSettings = team.WageSettings,
                        HrIntegrationProvider = team.HrIntegrationProvider,
                        Companies = team.Companies,
                        DocumentCategories = team.DocumentCategories ?? new List<DocumentCategory>(),
                        ShowWorkReadyStatus = request.ShowWorkReadyStatus,
                        TimeZone = team.TimeZone,
                        DateFormat = team.DateFormat,
                        TimeFormat = team.TimeFormat,
                    };
```

### `Intowork.Core/Models/Api/CreateTeamSettings.cs`

develop:

```csharp
        public bool IsEarlyAdopter { get; set; }
```

team-zone:

```csharp
        public string TimeZone { get; set; }
        public string DateFormat { get; set; }
        public string TimeFormat { get; set; }
```

### `Intowork.Core/Models/Api/TeamModel.cs`

develop:

```csharp
        public TeamPlan? Plan { get; set; }
        public bool IsEarlyAdopter { get; set; }
```

team-zone:

```csharp
        public string TimeZone { get; set; }
        public string DateFormat { get; set; }
        public string TimeFormat { get; set; }
```

### `Intowork.Core/Models/Api/TeamSettings.cs`

develop:

```csharp
        /// <summary>
        /// NB: null on a PUT means "unchanged", not "clear": a cached app bundle built before Document defaults
        /// existed sends no such field, and clearing would wipe every team's letterhead the first time an old
        /// client saved anything.
        /// </summary>
        public DocumentDefaults DocumentDefaults { get; set; }
        public bool IsEarlyAdopter { get; set; }
```

team-zone:

```csharp
        public string TimeZone { get; set; }
        public string DateFormat { get; set; }
        public string TimeFormat { get; set; }
```

### `Intowork.Core/Models/Data/Team.cs`

develop:

```csharp
        /// <summary>
        /// Null on teams that predate Document defaults (2026-09): GetTeamSettingsHandler serves <see cref="Data.DocumentDefaults.Default"/>
        /// in its place, and the quotation generator renders the default letterhead. The migration script
        /// (ProjectService/scripts/mongo) fills it from the retired Jobs:QuotationLayouts collection.
        /// </summary>
        public DocumentDefaults DocumentDefaults { get; set; }

        [BsonRepresentation(BsonType.String)]
        [BsonIgnoreIfNull]
        public TeamPlan? Plan { get; set; }
        public bool IsEarlyAdopter { get; set; } = false;
```

team-zone:

```csharp
        [BsonIgnoreIfNull]
        public string TimeZone { get; set; }
        [BsonIgnoreIfNull]
        public string DateFormat { get; set; }
        [BsonIgnoreIfNull]
        public string TimeFormat { get; set; }
```

### `Intowork.Core/Repositories/ITeamsRepo.cs`

develop:

```csharp
        Task<PaginationResult<Team>> GetAllTeamsAsync(GetAllTeamsSettingsQuery query, CancellationToken cancellationToken);
```

team-zone:

```csharp
        Task<int> GetDefaultGeofenceRadiusAsync(string teamName, CancellationToken cancellationToken);
        Task<PaginationResult<Team>> GetAllTeamsAsync(GetAllTeamsSettingsQuery query, IDateTimeProvider clock, CancellationToken cancellationToken);
```

### `Intowork.Core/Repositories/TeamsRepo.cs`

develop:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
```

team-zone:

```csharp
using Intowork.TeamTime;
```

### `Intowork.Core/Services/Documents/QuotationDocumentGenerator.cs`

**Hunk 1 of 2**

develop:

```csharp
using Azure.Storage.Blobs;
// A visible section with its visible children, and the grouping laid over those rows.
using SectionRows = (Intowork.Core.Models.Data.QuotationBuilderNode Section, System.Collections.Generic.List<Intowork.Core.Models.Data.QuotationBuilderNode> Children);
using GroupRows = (Intowork.Core.Models.Data.BuilderSectionGroup Group, System.Collections.Generic.List<(Intowork.Core.Models.Data.QuotationBuilderNode Section, System.Collections.Generic.List<Intowork.Core.Models.Data.QuotationBuilderNode> Children)> Rows);
```

team-zone:

```csharp
using Intowork.TeamTime;
```

**Hunk 2 of 2**

develop:

```csharp
            var now = DateTime.UtcNow;
```

team-zone:

```csharp
            var now = _clock.TeamNow;
            var company = team?.CompanyInformation;
```

### `Intowork.Jobs.API/Controllers/TeamSettingsController.cs`

develop:

```csharp
                documentDefaults: settings.DocumentDefaults);
```

team-zone:

```csharp
                showWorkReadyStatus: settings.ShowWorkReadyStatus,
                timeZone: settings.TimeZone,
                dateFormat: settings.DateFormat,
                timeFormat: settings.TimeFormat);
```

## ActiveWorkService (PR 11012): 2 file(s)

### `Intowork.ActiveWork.Background/Events/IntegrationEventHandlers/StaffMemberEmailChangedHandler.cs`

**Hunk 1 of 2**

develop:

```csharp
        public StaffMemberEmailChangedHandler(ILogger<StaffMemberEmailChangedHandler> logger,
            IIncomingIntegrationEventsRepo incomingEvents,
            IEventsRepo eventsRepo, IStaffAssignmentsRepo staffAssignments, IActiveWorkRepo activeWorkRepo,
            IOutboundIntegrationEventsRepo outboundEvents)
```

team-zone:

```csharp
        public StaffMemberEmailChangedHandler(ILogger<StaffMemberEmailChangedHandler> logger, IIncomingIntegrationEventsRepo incomingEvents,
            IEventsRepo eventsRepo, IStaffAssignmentsRepo staffAssignments, IActiveWorkRepo activeWorkRepo, IOutboundIntegrationEventsRepo outboundEvents,
            TimeProvider timeProvider, ITeamZoneResolver zones)
```

**Hunk 2 of 2**

develop:

```csharp
                var staffAssignmentAwIdsTask = _staffAssignments.GetAwIdsForStaffAfterDateAsync(@event.TeamName,
                    @event.StaffMemberId, fromDate.AddDays(-1), cancellationToken);
                var principleOrAssignedAwIdsTask =
                    _activeWorkRepo.GetActiveIdsForPrincipleOrAssignedStaffAsync(@event.StaffMemberId, @event.TeamName,
                        cancellationToken);
```

team-zone:

```csharp
                var staffAssignmentAwIdsTask = _staffAssignments.GetAwIdsForStaffAfterDateAsync(@event.TeamName, @event.StaffMemberId, clock.StartOfDayUtc(today.AddDays(-1)), cancellationToken);
                var principleOrAssignedAwIdsTask = _activeWorkRepo.GetActiveIdsForPrincipleOrAssignedStaffAsync(@event.StaffMemberId, @event.TeamName, cancellationToken);
```

### `Intowork.ActiveWork.Core/Intowork.ActiveWork.Core.csproj`

develop:

```xml
﻿<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup>
        <TargetFramework>net10.0</TargetFramework>
        <ProjectGuid>{23EE721D-FF9D-493F-87AC-871432DC5FF3}</ProjectGuid>
    </PropertyGroup>
    <ItemGroup>
        <PackageReference Include="Magick.NET-Q16-AnyCPU" Version="14.16.0"/>
        <PackageReference Include="Magick.NET.Core" Version="14.16.0"/>
        <PackageReference Include="MediatR" Version="13.1.0"/>
	    <PackageReference Include="Intowork.Common.Data" Version="2.2.1-rc.10642" />
        <PackageReference Include="Intowork.Common.Messaging" Version="2.1.7"/>
        <PackageReference Include="MailKit" Version="4.17.0"/>
        <PackageReference Include="Hangfire" Version="1.8.22"/>
        <PackageReference Include="Hangfire.Mongo" Version="1.12.2"/>
    </ItemGroup>
```

team-zone:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ProjectGuid>{23EE721D-FF9D-493F-87AC-871432DC5FF3}</ProjectGuid>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Azure.Storage.Blobs" Version="12.26.0" />
    <PackageReference Include="Magick.NET-Q16-AnyCPU" Version="14.16.0" />
    <PackageReference Include="Magick.NET.Core" Version="14.16.0" />
    <PackageReference Include="MediatR" Version="13.1.0" />
	  <PackageReference Include="Intowork.Common.Data" Version="2.2.1-rc.10642" />
	  <PackageReference Include="Intowork.Common.Messaging" Version="2.1.7" />
    <PackageReference Include="MailKit" Version="4.17.0" />
    <PackageReference Include="Microsoft.ApplicationInsights.AspNetCore" Version="2.23.0" />
	<PackageReference Include="Hangfire" Version="1.8.22" />
	<PackageReference Include="Hangfire.Mongo" Version="1.12.2" />
  </ItemGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
  </ItemGroup>
  <ItemGroup>
    <InternalsVisibleTo Include="Intowork.ActiveWork.Core.Tests" />
  </ItemGroup>
```

## HandoverService (PR 11017): 5 file(s)

- CONFLICT (modify/delete): Intowork.HandoverService.Background/Services/ReportGeneratorService.cs deleted in origin/develop and modified in HEAD.  Version HEAD of Intowork.HandoverService.Background/Services/ReportGeneratorService.cs left in tree.

### `Intowork.HandoverService.Background/Services/ReportGeneratorService.cs`

CONFLICT (modify/delete): Intowork.HandoverService.Background/Services/ReportGeneratorService.cs deleted in origin/develop and modified in HEAD.  Version HEAD of Intowork.HandoverService.Background/Services/ReportGeneratorService.cs left in tree.

### `Intowork.HandoverService.Background/appsettings.json`

develop:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  },
  "AllowedHosts": "*",
  "Db": {
    "Name": "",
    "ConnectionString": ""
  },
  "AzureRedis": {
    "ConnectionString": "",
    "Prefix": ""
  },
  "Email": {
    "SmtpHost": "",
    "SmtpPort": "",
    "UseSsl": "",
    "Username": "",
    "Password": "",
    "FromEmail": "",
    "FromName": "",
    "EmailSubject": "",
    "TestEmail": ""
  },
  "Storage": {
    "ConnectionString": "",
    "Prefix": ""
  },
  "Messaging": {
    "CheckDelaySeconds": "",
    "ConnectionString": "",
    "TopicPrefix": "",
    "SubscriptionIdentifier": "HandoverBg"
  },
  "Urls": {
    "ApproveHandoverBaseUrl": ""
  },
  "CustomLogging": {
    "SlackAlertUrl": ""
  },
  "Notifications": {
    "ApprovedHandoverDefaultRecipient": ""
  },
  "BatonBackfill": {
    "Enabled": true,
    "BatchSize": 50,
    "InterBatchDelaySeconds": 1,
    "ScanIntervalSeconds": 30,
    "MaxProjectsPerScan": 5
  }
}
```

team-zone:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  },
  "AllowedHosts": "*",
  "Db": {
    "Name": "",
    "ConnectionString": ""
  },
  "AzureRedis": {
    "ConnectionString": "",
    "Prefix": ""
  },
  "Email": {
    "SmtpHost": "",
    "SmtpPort": "",
    "UseSsl": "",
    "Username": "",
    "Password": "",
    "FromEmail": "",
    "FromName": "",
    "EmailSubject": "",
    "TestEmail": ""
  },
  "Storage": {
    "ConnectionString": "",
    "Prefix": ""
  },
  "Messaging": {
    "CheckDelaySeconds": "",
    "ConnectionString": "",
    "TopicPrefix": "",
    "SubscriptionIdentifier": "HandoverBg"
  },
  "IronPdf": {
    "Key": ""
  },
  "Urls": {
    "ApproveHandoverBaseUrl": ""
  },
  "CustomLogging": {
    "SlackAlertUrl": ""
  },
  "Notifications": {
    "ApprovedHandoverDefaultRecipient": ""
  },
  "BatonBackfill": {
    "Enabled": true,
    "BatchSize": 50,
    "InterBatchDelaySeconds": 1,
    "ScanIntervalSeconds": 30,
    "MaxProjectsPerScan": 5
  }
}
```

### `Intowork.HandoverService.Core.Tests/CQRS/Handlers/Commands/BatonHandoverHookTests.cs`

**Hunk 1 of 2**

develop:

```csharp
    private readonly Mock<IHandoverReportService> _reports = new();
```

team-zone:

```csharp
    private readonly Mock<IHandoverReminderPlanner> _reminderPlanner = new();
```

**Hunk 2 of 2**

develop:

```csharp
            _outboundEvents.Object, _batonPublisher.Object, _reports.Object);
```

team-zone:

```csharp
            _outboundEvents.Object, _batonPublisher.Object, _reminderPlanner.Object);
```

### `Intowork.HandoverService.Core/CQRS/Handlers/Commands/UpdateHandoverHandler.cs`

**Hunk 1 of 2**

develop:

```csharp
        private readonly IHandoverReportService _reportService;

        public UpdateHandoverHandler(IEventsRepo eventsRepo, ILogger<CreateHandoverHandler> logger,
            IHandoverNotificationsRepo handoverNotificationsRepo, IOutboundIntegrationEventsRepo outboundEvents,
            IBatonHandoverPublisher batonPublisher, IHandoverReportService reportService)
```

team-zone:

```csharp
        private readonly IHandoverReminderPlanner _reminderPlanner;

        public UpdateHandoverHandler(IEventsRepo eventsRepo, ILogger<CreateHandoverHandler> logger,
            IHandoverNotificationsRepo handoverNotificationsRepo, IOutboundIntegrationEventsRepo outboundEvents,
            IBatonHandoverPublisher batonPublisher, IHandoverReminderPlanner reminderPlanner)
```

**Hunk 2 of 2**

develop:

```csharp
            _reportService = reportService;
```

team-zone:

```csharp
            _reminderPlanner = reminderPlanner;
```

### `Intowork.HandoverService.Core/Intowork.HandoverService.Core.csproj`

develop:

```xml
    <EmbeddedResource Include="DocumentTemplates\**\*" />
```

team-zone:

```xml
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
```

## InspectionsService (PR 11018): 4 file(s)

- CONFLICT (add/add): Merge conflict in Intowork.Inspections.Background.Tests/Intowork.Inspections.Background.Tests.csproj
### `Intowork.Inspections.API/Extensions/InspectionsServiceCollectionExtensions.cs`

develop:

```csharp
using Intowork.Inspections.API.Customer.Extensions;
using Intowork.Inspections.Customer.Core;
```

team-zone:

```csharp
using Intowork.TeamTime;
```

### `Intowork.Inspections.Background.Tests/Intowork.Inspections.Background.Tests.csproj`

develop:

```xml
﻿<Project Sdk="Microsoft.NET.Sdk">

	<PropertyGroup>
		<TargetFramework>net10.0</TargetFramework>
		<Nullable>enable</Nullable>
		<ImplicitUsings>enable</ImplicitUsings>
		<IsPackable>false</IsPackable>
	</PropertyGroup>

	<ItemGroup>
		<PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.13.0" />
		<PackageReference Include="xunit" Version="2.9.3" />
		<PackageReference Include="xunit.runner.visualstudio" Version="2.8.2">
			<PrivateAssets>all</PrivateAssets>
			<IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
		</PackageReference>
		<PackageReference Include="Moq" Version="4.20.72" />
	</ItemGroup>

	<ItemGroup>
		<ProjectReference Include="..\Intowork.Inspections.Background\Intowork.Inspections.Background.csproj" />
		<!--
		  The two modules deliberately declare their own copies of the Intowork.Events contracts, so a project
		  that references both cannot name one of the duplicated types unqualified. Aliasing the customer module
		  makes the staff copies the default here - which is what these tests assert against - and the one file
		  that needs the customer module reaches it through `extern alias customercore`.
		-->
		<ProjectReference Include="..\Intowork.Inspections.Customer.Core\Intowork.Inspections.Customer.Core.csproj">
			<Aliases>customercore</Aliases>
		</ProjectReference>
	</ItemGroup>
```

team-zone:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="coverlet.collector" Version="6.0.4" />
    <PackageReference Include="Microsoft.Extensions.Logging.Abstractions" Version="10.0.9" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1" />
    <PackageReference Include="Moq" Version="4.20.72" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.4" />
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Intowork.Inspections.Core\Intowork.Inspections.Core.csproj" />
    <ProjectReference Include="..\Intowork.Inspections.Background\Intowork.Inspections.Background.csproj" />
  </ItemGroup>
```

### `Intowork.Inspections.Background/Extensions/InspectionsBackgroundServiceCollectionExtensions.cs`

develop:

```csharp
using Intowork.Inspections.Customer.Core.Extensions;
```

team-zone:

```csharp
using Intowork.TeamTime;
```

### `Intowork.Inspections.sln`

**Hunk 1 of 2**

develop:

```text
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Intowork.Inspections.Architecture.Tests", "Intowork.Inspections.Architecture.Tests\Intowork.Inspections.Architecture.Tests.csproj", "{09E505B5-9E7C-494E-A605-E86BBDE9DA41}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Intowork.Inspections.Core.Tests", "Intowork.Inspections.Core.Tests\Intowork.Inspections.Core.Tests.csproj", "{3233F4A4-C091-4B14-8BF3-03E9B9821107}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Intowork.Inspections.Background.Tests", "Intowork.Inspections.Background.Tests\Intowork.Inspections.Background.Tests.csproj", "{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Intowork.Inspections.Customer.Core", "Intowork.Inspections.Customer.Core\Intowork.Inspections.Customer.Core.csproj", "{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Intowork.Inspections.Customer.Core.Tests", "Intowork.Inspections.Customer.Core.Tests\Intowork.Inspections.Customer.Core.Tests.csproj", "{58FBEAE6-1416-4F29-92AB-93B4326422CD}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Intowork.Inspections.API.Tests", "Intowork.Inspections.API.Tests\Intowork.Inspections.API.Tests.csproj", "{CAA2A488-6138-4533-A13D-CD661172E573}"
```

team-zone:

```text
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Intowork.Inspections.Background.Tests", "Intowork.Inspections.Background.Tests\Intowork.Inspections.Background.Tests.csproj", "{245B46B7-096A-4F83-A56D-F59C9A632997}"
```

**Hunk 2 of 2**

develop:

```text
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Debug|x64.ActiveCfg = Debug|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Debug|x64.Build.0 = Debug|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Debug|x86.ActiveCfg = Debug|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Debug|x86.Build.0 = Debug|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Release|Any CPU.Build.0 = Release|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Release|x64.ActiveCfg = Release|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Release|x64.Build.0 = Release|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Release|x86.ActiveCfg = Release|Any CPU
		{09E505B5-9E7C-494E-A605-E86BBDE9DA41}.Release|x86.Build.0 = Release|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Debug|x64.ActiveCfg = Debug|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Debug|x64.Build.0 = Debug|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Debug|x86.ActiveCfg = Debug|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Debug|x86.Build.0 = Debug|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Release|Any CPU.Build.0 = Release|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Release|x64.ActiveCfg = Release|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Release|x64.Build.0 = Release|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Release|x86.ActiveCfg = Release|Any CPU
		{3233F4A4-C091-4B14-8BF3-03E9B9821107}.Release|x86.Build.0 = Release|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Debug|x64.ActiveCfg = Debug|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Debug|x64.Build.0 = Debug|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Debug|x86.ActiveCfg = Debug|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Debug|x86.Build.0 = Debug|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Release|Any CPU.Build.0 = Release|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Release|x64.ActiveCfg = Release|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Release|x64.Build.0 = Release|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Release|x86.ActiveCfg = Release|Any CPU
		{4F6401E5-F67F-43F4-88B2-034AAB2D1CA3}.Release|x86.Build.0 = Release|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Debug|x64.ActiveCfg = Debug|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Debug|x64.Build.0 = Debug|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Debug|x86.ActiveCfg = Debug|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Debug|x86.Build.0 = Debug|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Release|Any CPU.Build.0 = Release|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Release|x64.ActiveCfg = Release|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Release|x64.Build.0 = Release|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Release|x86.ActiveCfg = Release|Any CPU
		{B0B1236F-6DC3-49C1-B12A-FD7CB466BFD8}.Release|x86.Build.0 = Release|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Debug|x64.ActiveCfg = Debug|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Debug|x64.Build.0 = Debug|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Debug|x86.ActiveCfg = Debug|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Debug|x86.Build.0 = Debug|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Release|Any CPU.Build.0 = Release|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Release|x64.ActiveCfg = Release|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Release|x64.Build.0 = Release|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Release|x86.ActiveCfg = Release|Any CPU
		{58FBEAE6-1416-4F29-92AB-93B4326422CD}.Release|x86.Build.0 = Release|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Debug|x64.ActiveCfg = Debug|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Debug|x64.Build.0 = Debug|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Debug|x86.ActiveCfg = Debug|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Debug|x86.Build.0 = Debug|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Release|Any CPU.Build.0 = Release|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Release|x64.ActiveCfg = Release|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Release|x64.Build.0 = Release|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Release|x86.ActiveCfg = Release|Any CPU
		{CAA2A488-6138-4533-A13D-CD661172E573}.Release|x86.Build.0 = Release|Any CPU
```

team-zone:

```text
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Debug|x64.ActiveCfg = Debug|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Debug|x64.Build.0 = Debug|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Debug|x86.ActiveCfg = Debug|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Debug|x86.Build.0 = Debug|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Release|Any CPU.Build.0 = Release|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Release|x64.ActiveCfg = Release|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Release|x64.Build.0 = Release|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Release|x86.ActiveCfg = Release|Any CPU
		{245B46B7-096A-4F83-A56D-F59C9A632997}.Release|x86.Build.0 = Release|Any CPU
```

## MaterialsService (PR 11019): 1 file(s)

### `Intowork.MaterialsService.Core/Data/Repositories/Interfaces/IOrderRequestsRepo.cs`

develop:

```csharp
        Task<PaginationResult<OrderRequest>> GetAllPaginatedAsync(List<SearchData> filterList,List<SearchData> searchList,SortingData sortingData,PagingData pagingData,bool getAllData,string teamName,CancellationToken token);
        Task<OrderRequest> GetMostRecentCompletedAsync(string? idToExclude, string teamName, string projectId, CancellationToken token);
```

team-zone:

```csharp
        Task<PaginationResult<OrderRequest>> GetAllPaginatedAsync(List<SearchData> filterList,List<SearchData> searchList,SortingData sortingData,PagingData pagingData,bool getAllData,string teamName,IDateTimeProvider clock,CancellationToken token);
```

## Frontend (PR 11024): 12 file(s)

- CONFLICT (modify/delete): src/app/quotations/shared/quotation-builder-preview/quotation-builder-preview.component.html deleted in origin/develop and modified in HEAD.  Version HEAD of src/app/quotations/shared/quotation-builder-preview/quotation-builder-preview.component.html left in tree.

### `src/app/jobs/projects-map/projects-map.component.ts`

develop:

```typescript
    private readonly projectsFilterState: ProjectsFilterStateService,
```

team-zone:

```typescript
    private readonly clock: TeamClockService,
```

### `src/app/quotations/shared/quotation-builder-preview/quotation-builder-preview.component.html`

CONFLICT (modify/delete): src/app/quotations/shared/quotation-builder-preview/quotation-builder-preview.component.html deleted in origin/develop and modified in HEAD.  Version HEAD of src/app/quotations/shared/quotation-builder-preview/quotation-builder-preview.component.html left in tree.

### `src/app/resources/staff-detail/staff-detail.component.ts`

**Hunk 1 of 2**

develop:

```typescript
  fieldEnter(event: FocusEvent, path?: string) {
```

team-zone:

```typescript
  private setEmploymentDatesLocked(isLocked: boolean): void {
    for (const name of ['startdate', 'enddate']) {
      const control = this.staffForm.get(name);
      if (isLocked) {
        control?.disable({ emitEvent: false });
      } else {
        control?.enable({ emitEvent: false });
      }
    }
  }

  dateFieldEnter(name: string): void {
    if (this.editing?.field === name) {
      return;
    }
    this.editing = { field: name, value: this.staffForm.get(name).value };
  }

  dateFieldExit(name: string, event: FocusEvent): void {
    const host = event.currentTarget as Element;
    if (host.contains(event.relatedTarget as Node | null)) {
      return;
    }
    this.fieldExit(name);
  }

  fieldEnter(event: FocusEvent) {
```

**Hunk 2 of 2**

develop:

```typescript
  fieldExit(event: FocusEvent, path?: string) {
    const field = path ?? (event.target as Element).getAttribute('formControlName');
    if (
      this.editing.field === field &&
```

team-zone:

```typescript
  fieldExit(target: FocusEvent | string) {
    const exitedField =
      typeof target === 'string' ? target : (target.target as Element).getAttribute('formControlName');
    if (
      this.editing.field === exitedField &&
```

### `src/app/safety-suite/near-miss/near-miss-charts/near-miss-charts.component.ts`

**Hunk 1 of 2**

develop:

```typescript
import { Component, Inject, Input, LOCALE_ID } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { monthAxisLabel } from '../../safety-chart-labels';
```

team-zone:

```typescript
import { Component, inject, Input } from '@angular/core';
import { TeamClockService } from 'src/app/shared/team-clock/team-clock.service';
```

**Hunk 2 of 2**

develop:

```typescript
  constructor(
    private readonly translate: TranslateService,
    @Inject(LOCALE_ID) private readonly locale: string,
  ) {}
```

team-zone:

```typescript
  private readonly clock = inject(TeamClockService);

  constructor() {}
```

### `src/app/safety-suite/near-miss/near-miss-form/near-miss-form.component.html`

develop:

```html
      <label class="form-label d-block" for="nmIncidentDate">{{
        'safety-suite.near-miss-form.incident-time' | translate
      }}</label>
      <!-- Date + hour/minute dropdowns instead of datetime-local — see hourOptions in the .ts for why. -->
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <input
          #nmIncidentDate
          id="nmIncidentDate"
          class="form-control form-control-sm w-auto"
          type="date"
          [value]="incidentDate"
          [readonly]="!editMode"
          [attr.aria-label]="'safety-suite.near-miss-form.incident-date' | translate"
          (change)="setIncidentPart('date', nmIncidentDate.value)"
        />
        <ng-select
          class="nm-time-part"
          [items]="hourOptions"
          [ngModel]="incidentHour"
          [ngModelOptions]="{ standalone: true }"
          [clearable]="false"
          [readonly]="!editMode"
          [placeholder]="'safety-suite.near-miss-form.incident-hour' | translate"
          [attr.aria-label]="'safety-suite.near-miss-form.incident-hour' | translate"
          (change)="setIncidentPart('hour', $event)"
        ></ng-select>
        <span>:</span>
        <ng-select
          class="nm-time-part"
          [items]="minuteOptions"
          [ngModel]="incidentMinute"
          [ngModelOptions]="{ standalone: true }"
          [clearable]="false"
          [readonly]="!editMode"
          [placeholder]="'safety-suite.near-miss-form.incident-minute' | translate"
          [attr.aria-label]="'safety-suite.near-miss-form.incident-minute' | translate"
          (change)="setIncidentPart('minute', $event)"
        ></ng-select>
      </div>
```

team-zone:

```html
      <app-date-time-field
        id="nmIncidentTime"
        formControlName="incidentTime"
        mode="dateTime"
        [label]="'safety-suite.near-miss-form.incident-time' | translate"
      ></app-date-time-field>
```

### `src/app/safety-suite/near-miss/near-miss-form/near-miss-form.component.ts`

**Hunk 1 of 3**

develop:

```typescript

/**
 * The name the synthetic "Other" lookup is STORED under. The dropdown shows a translated name, but
 * the option travels to the API inside `typeOfEvent` / `tradeInvolved` / `whoNotified`, and the
 * register matches on this exact spelling (`NearMissReportComponent.mapToRow`) — so
 * {@link NearMissFormComponent.buildRequest} puts it back before anything is sent.
 */
const OTHER_NAME = 'Other';
```

team-zone:

```typescript
import { TeamClockService } from 'src/app/shared/team-clock/team-clock.service';
import { parseWire, toWire } from 'src/app/shared/time';
```

**Hunk 2 of 3**

develop:

```typescript

```

team-zone:

```typescript
  private enableViewOnlyControls(): void {
    this.form.get('anonymous')?.enable({ emitEvent: false });
    this.form.get('sendToClient')?.enable({ emitEvent: false });
    this.form.get('urgent')?.enable({ emitEvent: false });
    this.form.get('incidentTime')?.enable({ emitEvent: false });
  }
```

**Hunk 3 of 3**

develop:

```typescript
      incidentTime: value.incidentTime === '' ? null : new Date(value.incidentTime),
```

team-zone:

```typescript
      incidentTime: this.incidentTimeWire(value.incidentTime) || null,
```

### `src/app/safety-suite/safety-overview/safety-overview.component.ts`

**Hunk 1 of 4**

develop:

```typescript
import { Component, Inject, LOCALE_ID, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subject, combineLatest, takeUntil } from 'rxjs';
```

team-zone:

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { NearMiss, NearMissRow } from '../near-miss/near-mis';
import { NearMissService } from '../near-miss/near-miss.service';
import { TeamClockService } from 'src/app/shared/team-clock/team-clock.service';
```

**Hunk 2 of 4**

develop:

```typescript
  ngOnDestroy(): void {
    this.unsubscriber.next();
    this.unsubscriber.complete();
  }

  /** The `.tbt-compliance--<tone>` modifier for a percentage — the thresholds live in the metrics file. */
  complianceClass(percent: number): string {
    return `tbt-compliance--${complianceTone(percent)}`;
  }

  private compute(nearMisses: NearMiss[], talks: ToolboxTalk[], jobs: Job[]): void {
    const today = new Date();
    const delivered = deliveredTalks(talks);

    this.totalNearMisses = nearMisses.length;
    this.nearMissThisYear = nearMisses.filter((r) => reportedOn(r)?.getFullYear() === today.getFullYear()).length;
    this.totalTalks = talks.length;
    this.avgAttendance = averageAttendance(talks);
```

team-zone:

```typescript
  private monthKey(date: Date): string {
    return this.clock.format(date, 'yyyy-MM');
  }

  private compute(nm: NearMissRow[]): void {
    const thisYear = this.clock.today().slice(0, 4);

    this.totalNearMisses = nm.length;
    this.nearMissThisYear = nm.filter((r) => r.date && this.clock.dayOf(r.date).slice(0, 4) === thisYear).length;
```

**Hunk 3 of 4**

develop:

```typescript
  /** Near misses against toolbox talks, per month — the two safety activities on one axis. */
  private buildTrend(nearMisses: NearMiss[], talks: ToolboxTalk[]): void {
    const nmDates = nearMisses.map((r) => reportedOn(r)).filter((date): date is Date => !!date);
    // The booked slot, which is when the talk happened. A Draft has none and is simply not on the
    // timeline — there is no month it belongs to yet.
    const tbtDates = talks.map((talk) => talk.scheduledFor).filter((date): date is Date => !!date);

    const keys = [...new Set([...nmDates, ...tbtDates].map(monthKey))].sort();
    const categories = keys.map((key) => monthAxisLabel(key, this.locale));

    this.trend = {
      ...baseTrend(),
      series: [
        {
          name: this.translate.instant('safety-suite.overview.near-misses'),
          data: keys.map((key) => nmDates.filter((date) => monthKey(date) === key).length),
        },
        {
          name: this.translate.instant('safety-suite.overview.toolbox-talks'),
          data: keys.map((key) => tbtDates.filter((date) => monthKey(date) === key).length),
        },
```

team-zone:

```typescript
  private buildTrend(nm: NearMissRow[]): void {
    const keys = [...new Set(nm.filter((r) => r.date).map((r) => this.monthKey(r.date!)))].sort();
    const categories = keys.map((k) => {
      const [y, m] = k.split('-');
      return `${MONTHS[+m - 1]} ${y}`;
    });
    this.trend = {
      ...baseTrend(),
      series: [
        { name: 'Near misses', data: keys.map((k) => nm.filter((r) => r.date && this.monthKey(r.date) === k).length) },
```

**Hunk 4 of 4**

develop:

```typescript
/** A project's start, which the job list carries as either a `Date` or an ISO string. */
function startDateOf(job?: Job): Date | null {
  if (!job?.startDate) {
    return null;
```

team-zone:

```typescript
    const notifiedParts = (r.whoNotified ?? []).map((n) => n.name);
    if (r.whoNotifiedOther) notifiedParts.push(r.whoNotifiedOther);
    const whoNotifiedLabel = notifiedParts.join('; ');

    return {
      id: r.id,
      reference: r.reference,
      date: new Date(r.createdAt),
      time: this.clock.format(r.createdAt, 'HH:mm'),
      projectRef: r.project?.label ?? '',
      projectName: r.project?.name ?? '',
      type: typeLabel,
      whatHappened: r.description,
      location: r.location,
      trade: tradeLabel,
      operativesInvolved: '',
      howAvoided: r.howAvoided ?? '',
      whoNotified: whoNotifiedLabel,
      reportedBy: r.anonymous ? 'Anonymous' : (r.reporter?.fullName ?? ''),
      anonymous: r.anonymous ? 'Yes' : 'No',
      sendToClient: r.sendToClient ? 'Yes' : 'No',
      urgent: r.urgent ? 'Yes' : 'No',
      incidentTime: new Date(r.incidentTime),
      actioned: r.actioned ? 'Yes' : 'No',
      actionedBy: r.actionedBy?.fullName ?? '',
      createdBy: r.anonymous ? 'Anonymous' : (r.createdBy?.fullName ?? ''),
      actionedTime: r.actionedTime ? new Date(r.actionedTime) : null,
      _raw: r,
    };
```

### `src/app/shared/pdf-document.service.ts`

**Hunk 1 of 3**

develop:

```typescript
import { Inject, Injectable, LOCALE_ID } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
```

team-zone:

```typescript
import { inject, Injectable } from '@angular/core';
```

**Hunk 2 of 3**

develop:

```typescript
  constructor(
    pica: Pica,
    private readonly translate: TranslateService,
    @Inject(LOCALE_ID) private readonly locale: string,
  ) {
```

team-zone:

```typescript
  private readonly teamTime = inject(TeamTimeService);

  constructor(pica: Pica) {
```

**Hunk 3 of 3**

develop:

```typescript
    const stamp = new Date().toLocaleString(this.locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return [options.company, options.reference, this.translate.instant('shared.pdf-document.generated-from'), stamp]
      .filter(Boolean)
      .join('  ·  ');
```

team-zone:

```typescript
    const stamp = formatInZone(new Date(), this.teamTime.zone, `dd MMM yyyy, ${this.teamTime.timeFormat}`);
    return [options.company, options.reference, 'Generated from Baton', stamp].filter(Boolean).join('  ·  ');
```

### `src/app/shared/team-settings.ts`

**Hunk 1 of 2**

develop:

```typescript
  /**
   * The letterhead every generated document starts from. Read it through `documentDefaultsOf()`
   * (`document-defaults.ts`), never directly — an older API omits it.
   * ⚠️ Send it on every PUT. The API treats a MISSING object as "unchanged", so a client that dropped
   * the field would silently stop saving the letterhead rather than clearing it.
   */
  documentDefaults: DocumentDefaults;
  instructionsToWork: InstructionToWork[];
}

export interface InstructionToWork {
  id: string;
  instruction: string;
```

team-zone:

```typescript
  timeZone?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
```

**Hunk 2 of 2**

develop:

```typescript
  isEarlyAdopter: boolean;
```

team-zone:

```typescript
  timeZone?: string;
  dateFormat: string;
  timeFormat: string;
```

### `src/app/teams-settings/create-team-settings/create-team-settings.component.ts`

develop:

```typescript
    if (this.teamSettingsForm.valid && this.isLogoValid) {
      this.saving = true;
      const teamSettings = {} as CreateTeamSettings;
      teamSettings.teamName = this.teamSettingsForm.get('teamName').value;
      teamSettings.teamDisplayName = this.teamSettingsForm.get('teamDisplayName').value;
      teamSettings.teamAdminEmail = this.teamSettingsForm.get('teamAdminEmail').value;
      teamSettings.testEmails = this.teamSettingsForm.get('testEmails').value;
      teamSettings.defaultInactiveStaffEmail = this.teamSettingsForm.get('defaultInactiveStaffEmail').value;
      teamSettings.teamType = this.teamSettingsForm.get('teamType').value;
      teamSettings.licenseType = this.teamSettingsForm.get('licenseType').value;
      teamSettings.isActive = this.teamSettingsForm.get('isActive').value;
      teamSettings.simplePricing = this.teamSettingsForm.get('simplePricing').value;
      teamSettings.pricingVersion = this.teamSettingsForm.get('pricingVersion').value;
      teamSettings.acceptanceWorkflow = this.teamSettingsForm.get('acceptanceWorkflow').value;
      teamSettings.quotationsEnabled = this.teamSettingsForm.get('quotationsEnabled').value;
      teamSettings.sector = this.teamSettingsForm.get('sector').value;
      teamSettings.takeoffEnabled = this.teamSettingsForm.get('takeoffEnabled').value;
      teamSettings.yardOverviewEnabled = this.teamSettingsForm.get('yardOverviewEnabled').value;
      teamSettings.gafferEnabled = this.teamSettingsForm.get('gafferEnabled').value;
      teamSettings.isEarlyAdopter = this.teamSettingsForm.get('isEarlyAdopter').value ?? false;
      teamSettings.teamLogo = this.teamLogo;
      // teamSettings.googlePlacesAPIKey = this.teamSettingsForm.get('googlePlacesAPIKey').value;
      teamSettings.wageWeekStartDay = this.teamSettingsForm.get('wageWeekStartDay').value;

      teamSettings.companyInformation = {
        website: this.teamSettingsForm.get('website').value,
        address: this.teamSettingsForm.get('address').value,
        contactTelephone: this.teamSettingsForm.get('contactTelephone').value,
        mainContact: this.teamSettingsForm.get('mainContact').value,
        email: this.teamSettingsForm.get('email').value,
        signatureName: this.teamSettingsForm.get('signatureName').value,
        registrationNumber: this.teamSettingsForm.get('registrationNumber').value,
        vatNumber: this.teamSettingsForm.get('vatNumber').value,
      } as CompanyInformation;

      teamSettings.subscriptionInformation = {
        startDate: this.teamSettingsForm.get('startDate').value,
        betaPeriodEndDate: this.teamSettingsForm.get('betaPeriodEndDate').value,
        stoppedDate: this.teamSettingsForm.get('stoppedDate').value,
        companyType: this.teamSettingsForm.get('companyType').value,
      } as SubscriptionInformation;

      teamSettings.hrIntegrationProvider = {
        hrProvider: this.teamSettingsForm.get('hrProvider').value,
        hrApiKey: this.teamSettingsForm.get('hrApiKey').value,
        hrPollingIntervalHrs: this.teamSettingsForm.get('hrPollingIntervalHrs').value,
        hrSyncLookbackDays: this.teamSettingsForm.get('hrSyncLookbackDays').value,
      } as HRIntegrationProvider;

      this.teamSettingsService.createTeamSettings(teamSettings).subscribe(
        (s) => {
          this.notify.success('Team Added');
          this.saving = false;
          this.router.navigate(['teams']);
        },
        (err) => {
          console.log(err);
          if (err?.error == 'TeamName') {
            this.notify.error('Team Name already exists, Please choose another name');
            this.onSelectedTabChange({ index: 0 });
            this.teamNameInput?.nativeElement?.focus();
          } else {
            this.notify.error('Error adding team');
          }
          this.saving = false;
        },
      );
    } else {
```

team-zone:

```typescript
    if (!this.teamSettingsForm.valid || !this.isLogoValid) {
```

### `src/app/teams-settings/edit-team-settings/edit-team-settings.component.ts`

**Hunk 1 of 3**

develop:

```typescript
import { PLAN_BY_KEY, Plan, planDisplayLabel, tryPlanKey } from 'src/app/shared/tenant-plan/tenant-plan';
```

team-zone:

```typescript
import { TeamTimeService } from 'src/app/shared/time/team-time.service';
import { normalizeTeamTimeSettings } from 'src/app/shared/time/team-time-settings';
```

**Hunk 2 of 3**

develop:

```typescript
      isEarlyAdopter: new UntypedFormControl(this.settings?.isEarlyAdopter),
```

team-zone:

```typescript
      timeZone: new UntypedFormControl({ value: this.storedTime.timeZone, disabled: true }),
      dateFormat: new UntypedFormControl(this.storedTime.dateFormat, FormValidators.required),
      timeFormat: new UntypedFormControl(this.storedTime.timeFormat, FormValidators.required),
```

**Hunk 3 of 3**

develop:

```typescript
      teamSettings.isEarlyAdopter = this.teamSettingsForm.get('isEarlyAdopter').value;
```

team-zone:

```typescript
      teamSettings.dateFormat = this.teamSettingsForm.get('dateFormat').value;
      teamSettings.timeFormat = this.teamSettingsForm.get('timeFormat').value;
```

### `src/app/wage/adjustmenttable-date-selector/adjustmenttable-date-selector.component.ts`

develop:

```typescript
import { HelpDocDialogComponent } from 'src/app/shared/help/help-doc-dialog/help-doc-dialog.component';
```

team-zone:

```typescript
import { TeamClockService } from '../../shared/team-clock/team-clock.service';
import { dayLabelDate } from '../../shared/team-day-label';
```

