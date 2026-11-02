# Project bucket uploads

Status: Implemented locally on 2026-10-30 (Asia/Singapore), following an explicit run-spec implementation request. Live R2/CDN acceptance and publishing remain separate gates. See [local validation](VALIDATION.md).

## Purpose and confirmed decisions

FileForge will upload explicitly selected local assets to a project's Cloudflare R2 bucket and report their public URLs. Users will maintain one private local JSON object whose keys identify projects, such as `example.com`, and whose values contain that project's connection fields and credentials.

The latest ProductDesignSkills `upload-r2-assets` skill supplies the review workflow. FileForge will not adopt its team hierarchy. There will be no team selection, team inheritance, environment hierarchy, or automatically selected project. One project entry will describe one upload destination. A domain-shaped project key is an identifier, not an instruction to derive a bucket, domain, or object path.

The user's private JSON requirement supersedes the earlier conversational suggestion to use Keychain and credential references. A dedicated upload workspace package will implement the capability. This specification covers product behavior; [TECH.md](TECH.md) defines the configuration schema and integration.

## Scope

The first implementation will support R2 S3-compatible uploads, a project configuration check, local upload planning, explicitly approved execution, conditional collision protection, public URL checks, and read-only reconciliation after uncertain outcomes. CLI and MCP will expose the same operations.

It will not create buckets, provision DNS, change Cloudflare permissions, upload as part of compression, rename or transcode source assets, unpack archives, edit business repositories, replace historical assets without specific authorization, purge caches, delete remote objects, or automatically retry writes. Generic S3 providers, multipart/resumable uploads, secret-manager integrations, private signed delivery URLs, background scheduling, and persistent job management are outside this first version.

## Observable requirements

### P01. Explicit project selection

Every configuration check, plan, execution, and reconciliation request will name an exact project key. Unknown keys will fail without falling back to another project, the current directory, a remembered chat preference, or a default bucket. The selected project must match the plan or receipt.

Projects may use different buckets and credentials, or explicitly configured shared buckets and credentials. FileForge will not require a bucket per project or infer credential sharing. Shared credentials retain their actual remote permissions; project names and prefixes do not create a server-side security boundary.

### P02. User-owned private configuration

The configuration file will be maintained by the user, treated like a secret-bearing local environment file, excluded from Git and distribution, and never included among uploaded assets. FileForge will read it but will not create, format, migrate, fix, rewrite, back up, or delete the real file. Installation, upgrade, skill copying, language changes, and upload operations must preserve its bytes.

Agents will use sanitized FileForge diagnostics instead of opening the real file, asking the user to paste it into chat, or editing it. On an invalid or missing configuration, they will explain the required field or repair and ask the user to edit locally. Examples and schema documentation will contain placeholders only.

This is plaintext secret storage, not encryption. Git ignore rules and agent instructions cannot prevent every process running as the same operating-system user from reading a file. The runtime must be able to read credentials; the agent must not receive their values. Stronger process isolation or encrypted secret storage would require a separate design.

### P03. Stable configuration and safe diagnostics

The JSON shape will be fixed and versioned inside each project value, preserving a pure project map at the outermost level. Each project will contain an endpoint, bucket, region, public base URL, object prefix, and credentials. Unknown fields, duplicate keys, invalid types, missing required fields, and unsupported versions will fail safely.

Configuration will not inherit or merge values from other projects, application `.env` files, AWS profiles, or ambient R2 environment variables. Each operation will take one configuration snapshot. Later edits will affect later operations. A changed destination between planning and execution will require a new plan and review; a credential-only rotation may use the unchanged reviewed destination.

Errors will identify a stable error code and known field name without echoing values, source excerpts, signatures, headers, or provider response bodies. Offline validity will never be described as verified remote connectivity or confirmed write permission.

### P04. Predictable bucket and domain mapping

The destination will be computed as follows:

- Object key: the explicitly configured `FILE_PATH` plus the selected file's path relative to the input directory. For a single-file input, use its basename.
- Public URL: the configured `R2_PUBLIC_BASE_URL`, a slash, and the encoded object key.

An explicitly empty `FILE_PATH` will mean the bucket root. A missing field will be an error. A nonempty prefix must end with a slash. FileForge will not append project names, team names, input-directory names, batch versions, or timestamps automatically, and will not silently change names or extensions.

For example, two projects with separate buckets, empty prefixes, and public roots `https://example.com` and `https://example2.com` can each upload `xxx.png` and receive their own domain's `/xxx.png` URL. If they share a bucket, identical object keys refer to the same object regardless of the displayed domain. Distinct project prefixes are necessary to separate those keys. Public domain routing must already exist; configuring a URL does not provision it or remove an object prefix.

The first version will require direct root-plus-key URL mapping. Rewriting or hiding prefixes behind a gateway is not inferred or configured by this feature.

### P05. First-time configuration

1. The user identifies the project, existing bucket, R2 API endpoint, direct public domain mapping, prefix, and appropriate object credentials. Account-wide bucket administration credentials are unnecessary for uploading.
2. The user creates the private JSON locally from the documented placeholder example, restricts local access, and verifies Git exclusion if it is inside a repository. The preferred location is outside repositories and skill directories.
3. The user fills in values privately. FileForge and the agent do not populate real credentials or automatically import an old `.local` file.
4. The user or agent runs the proposed configuration check for the exact project. It reports structure, access protection, required-field status, and offline readiness with no remote writes.
5. A valid configuration enables planning. It does not automatically trigger an upload or a synthetic test-object upload.

The same steps apply when adding another project. There is no team setup step. Credential rotation and removal remain user edits; removing local credentials does not revoke them at Cloudflare.

### P06. Reviewable asset selection

Planning will be offline and will produce a complete file-to-destination table with project, local file, relative path, size, content digest, MIME type, bucket, key, expected URL, and create-or-replace intent. The plan will distinguish selected assets, excluded non-assets, and blocking problems. An empty selection is not a successful upload plan.

When configuration is incomplete, the skill may still prepare an informational asset review table with unresolved destinations marked as unknown. Such a table is not an executable FileForge plan and does not justify guessing configuration or reading the private JSON into the conversation.

Directory traversal must be explicit. Plans will reject unsafe paths, symlinks, duplicate destination keys, unsupported inputs, and configured size/count limits before upload. Secrets, delivery reports, project logs, prompt documents, and upload control files will not become assets through directory selection. Only assets included in the reviewed plan can be uploaded.

Existing media output folders may be selected, but their manifests and reports are not automatically published. Upload preserves bytes. Any required cover/poster image processing happens upstream through the existing image workflow; upload will not add a redundant encoding pass.

Project-specific page structure, section semantics, content appropriateness, paired prompts, and naming conventions remain human/skill review responsibilities. FileForge will not copy the reference skill's hardcoded site names or naming styles into the generic transport.

### P07. Approval and execution

The user will review specific assets and mappings before execution. Review approval, permission to reorganize local files, permission to upload, permission to replace objects, and permission to edit site links are separate. Existing explicit authorization for the same content and destinations may be reused; changed files or mappings require renewed review for the changed scope.

Execution will reference the reviewed plan and its digest. That digest binds the supplied execution request to plan contents; it does not prove that a human approved anything. Agent instructions must enforce actual user authorization. A plan, configured credentials, or an execution flag alone is not authorization for an agent to publish.

Before sending bytes, FileForge will revalidate the selected project, destination, files, and plan. It will send exactly the bytes whose digest was reviewed. A detected change will stop the affected work, preserve completed outcomes, and require a fresh plan. Uploading will not automatically update a website or its prompts.

### P08. Conflicts and explicitly approved replacement

Creation will be the default. Atomic conditional writes will refuse existing objects, including when another uploader creates an object after planning. FileForge will not silently enable replacement after a conflict.

Replacement must identify individual reviewed keys; no project-wide persisted overwrite switch will exist. Execution will observe the current object and use an atomic condition for replacement. A concurrent change will stop the write. The approval identifies the key and proposed new content, not a promise to preserve or restore the old object version. Historical objects must not be included without specific replacement authorization.

The batch is not a transaction. Already completed objects remain when a later file fails, conflicts, or is cancelled. There is no automatic remote rollback.

### P09. Truthful progress, failures, and recovery

Execution will record each attempted file separately. A confirmed upload and a public URL access check are different results. A successful public HEAD request means the URL responded; it does not prove current content bytes or CDN cache freshness. Public access failure after a confirmed upload will not cause another PUT.

On a write timeout, disconnected response, cancellation during a request, or interrupted process, the affected write may have committed. The receipt must report uncertainty instead of claiming failure or absence. A later read-only verification can compare stored bytes with the reviewed digest. An absent object observed while an earlier write may still be in flight does not prove that write failed.

No automatic retries, bucket switching, cache clearing, or deletes will occur. Recovery will inspect existing receipts and remote state, then create a separately reviewed plan for any remaining work. Replaying a completed or uncertain execution is not a recovery strategy.

### P10. Lifecycle and records

CLI cancellation and MCP cancellation/disconnection will stop dispatch, abort active transfers, close owned resources, and preserve known results. MCP status and cancellation remain responsive during hashing, staging, network operations, and verification.

Plans and receipts will be local, versioned, sanitized artifacts. They will not contain secret configuration copies. Existing media manifests and their version compatibility will remain intact. Session-local MCP jobs will not become durable jobs: an unknown job after reconnect does not prove that nothing was uploaded. The plan's execution record and receipt are the recovery evidence.

The skill may use sanitized results to append a project delivery log in its established workflow. The upload package will not mutate ProductDesignSkills or business-repository logs itself.

## Acceptance scenarios

| Scenario                                                      | Required result                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Two projects, two buckets, same filename                      | Each explicit selection resolves only its configured bucket and public URL.           |
| Two projects share a bucket with different prefixes           | Each reviewed mapping retains its prefix; no additional project layer appears.        |
| Missing project, malformed JSON, or invalid field             | Offline failure without network access, file repair, or secret disclosure.            |
| User rotates only credentials                                 | Next execution reads the new credentials while retaining the reviewed destination.    |
| User changes bucket, endpoint, prefix, or domain after review | Execution rejects the stale plan before uploading.                                    |
| Existing object without replacement authorization             | Atomic conflict; no overwrite.                                                        |
| File changes after planning                                   | Changed bytes are not uploaded under the earlier approval.                            |
| Upload succeeds but CDN HEAD fails                            | Receipt retains upload success and independently reports the public check failure.    |
| PUT response is lost                                          | Unknown write outcome; no automatic retry; read-only reconciliation remains possible. |
| Cancellation halfway through a batch                          | Completed objects remain, active write may be unknown, unsent files remain unsent.    |
| Compression, installation, upgrade, or skill copy             | No implicit uploads and no changes to the user's private JSON.                        |

## Proposed defaults and handoff

R2-only scope, an external user configuration location, explicit recursive selection, serial bounded transfers, and the numerical limits in TECH.md are proposed first-version defaults. They do not describe installed capabilities. No team or nested environment layer will be added. Distinct destinations, if needed, will be separate explicit project keys.

Implementation will require the repository's real non-UI E2E checks and a separately authorized remote acceptance upload before claiming live R2/CDN compatibility. The original design-only task did not authorize implementation or remote acceptance testing. The later run-spec request authorized local implementation; remote acceptance testing still requires separate authorization.
