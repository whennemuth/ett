## Rebasing with Git

Rebasing has turned out to be a useful tool for an unpublished commit history that needs to be amended.
The most common scenario that is turning up that requires rebasing is as follows:

1. Changes are made to the working tree, staged and committed (commit `85eb9fa`).
2. Several commits are made on top of commit `85eb9fa`.
3. The working tree is once again worked on and it is found that one of the changes that is being made actually belongs in commit `85eb9fa`.
   Had the change belonged in the most recent commit, this could simply be fixed by using [git commit --amend](https://git-scm.com/docs/git-commit#Documentation/git-commit.txt---amend).

The commit history looks something like this:

```
$ git log --oneline -n 5
f256dac (HEAD -> master) Fixing tagging (wasn't working - had to use aspects)
9ed1ab5 Adding some shortcut scripts to package.json
98e7f73 Upgrading version of aws-cdk
85eb9fa Changing GATEKEEPER name to SYS_ADMIN
44c87c5 Presignup test stub
```

To apply the change in the working tree to commit `85eb9fa` and have it carried into each subsequent commit, perform the following steps:

1. Stage or stash your current working tree.

2. Start an interactive rebase from the commit before `85eb9fa`:

   ```
   git rebase -i 85eb9fa^
   ```

   This will open an editor with a list of commits.

3. In the editor, find the line corresponding to the commit you want to modify (`85eb9fa`), change the word "pick" to "edit", and save the file.

4. Git will stop at the commit you want to modify (`85eb9fa`). Now you can make the changes you want to this commit.

5. Stage the changes.

   ```
   git add --all
   ```

6. Commit the changes.

   ```
   git commit --amend
   ```

   This will open the editor again, allowing you to modify the commit message and make additional changes.
   However, if the commit message need not change, use:

   ```
   git commit --amend --no-edit
   ```

7. After making your changes, save and close the editor.

8. Continue with the rebase:

   ```
   git rebase --continue
   ```

   This will apply the changes to the modified commit and continue with the rebase.

9. Git will automatically apply the changes to all subsequent commits after `85eb9fa`. You don't need to do anything else to make subsequent commits inherit the changes.

10. Save and close the editor when you are done with the rebase.

Now, your commit `85eb9fa` and its commit message have been modified, and all subsequent commits have been updated to reflect the changes in `85eb9fa`. You don't need to squash the commits for this approach.

Again, this is useful for a commit history that has not been pushed upstream yet, or has already been pushed to an upstream feature branch that only you have been working on. In that case you can apply the steps in: [Recovering from an upstream rebase](https://git-scm.com/docs/git-rebase#_recovering_from_upstream_rebase)