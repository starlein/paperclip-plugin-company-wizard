# Populate an empty local template directory

An explicit `templatesPath` still overrides the remote source. Opening the wizard,
Test Configuration, provisioning, and Refresh do not populate that directory.

If the existing directory is completely empty (including hidden entries), the
wizard offers **Confirm sync from configured template URL**. Set and save
`templatesRepoUrl` first if no URL is configured. The button authorizes one sync
from that saved source. On success, the wizard reloads its template catalog.

The source must be an HTTPS GitHub tree URL without credentials or query strings.
Downloads are staged beside the target and validated before an atomic rename.
The base CEO and all metadata must be valid. Symlink entries are rejected.
Confirmation is bound to the saved source and directory identity. Files added
while downloading cause sync to fail without overwriting them. Failed downloads
leave the directory intact and remove staging files. A populated but malformed
library is not an empty directory and never receives a sync offer.

The parent directory must be writable for staging and atomic rename. Mount roots
that cannot be renamed fail safely; select a normal empty subdirectory instead.
This feature does not update populated operator libraries. Manage those files
manually, or clear `templatesPath` to use the normal bundled/custom-cache flow.
