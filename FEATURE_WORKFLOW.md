# Feature Integration and Pull Request Workflow

Use this workflow for every feature branch, regardless of the feature name.

## Branch Names

Replace the placeholders with the branches for the feature being delivered:

```text
FEATURE_BRANCH=feature/<version>/<feature-name>
INTEGRATION_BRANCH=feature/<version>/<feature-name>-develop
TARGET_BRANCH=develop
```

## Workflow

1. Implement and verify the change on `FEATURE_BRANCH`.
2. Merge `FEATURE_BRANCH` into `INTEGRATION_BRANCH`.
3. Merge the latest `TARGET_BRANCH` into `INTEGRATION_BRANCH`.
4. Resolve any merge conflicts in `INTEGRATION_BRANCH`, then verify the integrated result.
5. Push `INTEGRATION_BRANCH` to the remote repository.
6. Create an Azure DevOps pull request from `INTEGRATION_BRANCH` into `TARGET_BRANCH`.

## Merge Commands

Run these commands in each repository that participates in the feature:

```bash
git switch "$INTEGRATION_BRANCH"
git merge "$FEATURE_BRANCH"
git merge "$TARGET_BRANCH"

# Resolve conflicts if Git reports any, then stage the resolved files.
git add <resolved-files>
git commit

git push -u origin "$INTEGRATION_BRANCH"
```

## Pull Request Requirements

- Source branch: `INTEGRATION_BRANCH`
- Target branch: `TARGET_BRANCH`
- Repository: the corresponding Azure DevOps repository
- Create the pull request only after the feature work, merges, conflict resolution, and verification are complete.
