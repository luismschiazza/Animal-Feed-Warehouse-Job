# Image CVE triage — baseline and final artifacts

Scope: every baseline HIGH/CRITICAL finding and EVERY remaining final finding (including lower severities). Complete raw baseline/final SARIFs are archived externally. Identifiers/severities/versions/fix boundaries are copied from Scout, not invented or inferred. Findings are not proof of exploitability. No blanket suppression, CVE exception, or production acceptance is applied.

Source evidence: original production/development/Mongo image SARIFs; final-phase2 SARIFs; Scout --locations logs; direct filesystem, package-manager and global-npm probes. Removed tools are absent from the final Mongo filesystem AND distributed final layers (clean copy from prepared pinned source, no vulnerable upstream layers shipped). The same mongod/mongosh/runtime libraries are retained; backup/import/automatic init is deliberately excluded. Linux Debian/Ubuntu severity feeds can differ for the same CVE; counts are not additive across images.

## production

Before: 65 total: {"CRITICAL":0,"HIGH":13,"MEDIUM":13,"LOW":39,"UNSPECIFIED":0}
After: 28 total: {"CRITICAL":0,"HIGH":1,"MEDIUM":1,"LOW":26,"UNSPECIFIED":0}

### CVE-2026-53613
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: util-linux is a random collection of Linux utilities. In util-linux 2.17 through 2.41.6 and 2.42 through 2.42.3, and in 2.42.4 when the legacy `mount(2)` path is used without `/proc`, restricted non-root `mount` requests validate an `/etc/fstab` target before the mount operation re-resolves that pathname. A local low-privileged user authorized by an fstab `user` or `users` entry whose target has an attacker-writable ancestor can use `renameat2(RENAME_EXCHANGE)` to swap a path component and redirect an authorized mount to a root-owned location, such as mounting attacker-controlled content over `/etc/sudoers.d`, and thereby gain root privileges. Versions 2.41.5 and 2.42.2 pin targets for the new mount API, and 2.42.4 pins legacy targets through `/proc/self/fd`; the documented legacy fallback without `/proc` remains affected.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78409
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: The X-mount.subdir option uses a detached-tree fast path on Linux 6.15 and later and passes the configured subdirectory to open_tree() with AT_SYMLINK_NOFOLLOW. That flag does not stop intermediate symlink traversal or keep resolution inside the newly mounted filesystem. A local unprivileged user with an fstab-authorized X-mount.subdir entry can attach a host path at the intended mountpoint.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-102276
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/brace-expansion@5.0.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 5.0.10 / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: ### Summary
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-102278
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/brace-expansion@5.0.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 5.0.11 / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: ### Summary
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-109869
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/undici@6.28.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 6.29.1 / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: ### Impact
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-19534
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/undici@6.28.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 6.28.1 / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: ### Impact
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-82560
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/perl@5.36.0-7+deb12u4.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: Pod::Text versions before 6.1.1 for Perl allow CPU and memory exhaustion formatting a POD document whose =over nesting drives the margin to the output width. Each =over adds its indent to the margin, which wrap() subtracts from the output width to get the space available for text. When that space reaches zero, the line-splitting substitution matches the empty string, and the loop consumes no input while appending the margin padding on every pass. Formatting an attacker-supplied POD document never returns, and the output grows until memory is exhausted.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78410
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in util-linux. Restricted bind mounts take the source path from fstab but do not pin that source before the privileged mount. A local unprivileged user who can replace the authorized source or a writable ancestor can redirect SUID mount(8) to bind another host directory. If the fstab entry also sets X-mount.owner, X-mount.group, or X-mount.mode, root then changes ownership or mode on that redirected inode.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78408
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: The nsenter --join-cgroup option opens the target cgroup.procs file as root and leaves that file descriptor open across later namespace and credential changes and across execve(). Because the kernel checks later cgroup migrations using the credentials from the original open, a program run in an attacker-controlled target can inherit root's ability to move host processes between cgroups. After a privileged operator uses --join-cgroup against that target, an unprivileged user can migrate and terminate unrelated root processes.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-53615
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: util-linux is a random collection of Linux utilities. Before util-linux 2.41.4, `parse_dos_extended()` in `libblkid/src/partitions/dos.c` computes an extended-partition start sector with 32-bit addition and does not apply the extended-area bounds checks to the first two EBR entries. A local attacker who causes a crafted DOS extended-partition disk image or removable medium to be probed can wrap `cur_start + start` to sector zero and cause libblkid to report a false partition overlapping the MBR. This directly compromises the integrity of the reported partition metadata; disk modification or availability loss requires a separate downstream consumer to act on that metadata. This issue is fixed in 2.41.4.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-85091
- Severity before → after: HIGH → HIGH.
- Package/version before: pkg:deb/debian/zlib@1:1.2.13.dfsg-1.
- Package/version after: pkg:deb/debian/zlib@1:1.3.dfsg+really1.3.1-1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: zlib versions 1.3.1.2 through 1.3.2 contain a heap buffer overflow vulnerability in the gz_vacate() function when processing non-blocking gzwrite() operations with stale external buffer pointers. Attackers can trigger the overflow by calling gzprintf() or gzvprintf() after a write stall, causing an unchecked memmove() to write beyond the internal input buffer boundary.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-76642
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: util-linux versions through 2.41.5 and 2.42.2 fail to check mount helper exit status before running post-mount hooks, allowing unprivileged users to execute privileged operations on pre-existing filesystems. Attackers can exploit X-mount.idmap or X-mount.owner hooks to clone filesystems with inherited suid bits or modify target inode permissions after a helper fails, achieving privilege escalation.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-93748
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/http-cache-semantics@4.2.0.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: http-cache-semantics through 4.2.0 fails to properly validate security-zeroed cache entries when processing client max-stale directives, allowing unauthenticated attackers to retrieve cached responses belonging to other users. Attackers can request the same URL with a large max-stale value to obtain another user's Set-Cookie session credentials from shared-cache entries that were deliberately zeroed for security reasons.
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2005-2541
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/tar@1.34+dfsg-1.2+deb12u1.
- Package/version after: pkg:deb/debian/tar@1.35+dfsg-3.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: Tar 1.15.1 does not properly warn the user when extracting setuid or setgid files, which may allow local users or remote attackers to gain privileges.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2007-5686
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/shadow@1:4.13+dfsg1-1+deb12u2.
- Package/version after: pkg:deb/debian/shadow@1:4.17.4-2.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: initscripts in rPath Linux 1 sets insecure permissions for the /var/log/btmp file, which allows local users to obtain sensitive information regarding authentication attempts. NOTE: because sshd detects the insecure permissions and does not log certain events, this also prevents sshd from logging failed authentication attempts by remote attackers.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2010-0928
- Severity before → after: not reported → LOW.
- Package/version before: not detected in this scan.
- Package/version after: pkg:deb/debian/openssl@3.5.7-1~deb13u3.
- Published fix before / after: not listed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: OpenSSL 0.9.8i on the Gaisler Research LEON3 SoC on the Xilinx Virtex-II Pro FPGA uses a Fixed Width Exponentiation (FWE) algorithm for certain signature calculations, and does not verify the signature before providing it to a caller, which makes it easier for physically proximate attackers to determine the private key via a modified supply voltage for the microprocessor, related to a "fault-based attack."
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2010-4756
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: The glob implementation in the GNU C Library (aka glibc or libc6) allows remote authenticated users to cause a denial of service (CPU and memory consumption) via crafted glob expressions that do not match any pathnames, as demonstrated by glob expressions in STAT commands to an FTP daemon, a different vulnerability than CVE-2010-2632.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2011-3374
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/apt@2.6.1.
- Package/version after: pkg:deb/debian/apt@3.0.3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: It was found that apt-key in apt, all versions, do not correctly validate gpg keys with the master keyring, leading to a potential man-in-the-middle attack.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2011-4116
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/perl@5.36.0-7+deb12u4.
- Package/version after: pkg:deb/debian/perl@5.40.1-6+deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: _is_safe in the File::Temp module for Perl does not properly handle symlinks.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2013-4392
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/systemd@252.39-1~deb12u2.
- Package/version after: pkg:deb/debian/systemd@257.13-1~deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: systemd, when updating file permissions, allows local users to change the permissions and SELinux security contexts for arbitrary files via a symlink attack on unspecified files.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2017-18018
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/coreutils@9.1-1.
- Package/version after: pkg:deb/debian/coreutils@9.7-3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: In GNU Coreutils through 8.29, chown-core.c in chown and chgrp does not prevent replacement of a plain file with a symlink during use of the POSIX "-R -L" options, which allows local users to modify the ownership of arbitrary files by leveraging a race condition.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2018-20796
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: In the GNU C Library (aka glibc or libc6) through 2.29, check_dst_limits_calc_pos_1 in posix/regexec.c has Uncontrolled Recursion, as demonstrated by '(\227|)(\\1\\1|t1|\\\2537)+' in grep.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-1010022
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Libc current is affected by: Mitigation bypass. The impact is: Attacker may bypass stack guard protection. The component is: nptl. The attack vector is: Exploit stack buffer overflow vulnerability and use this bypass vulnerability to bypass stack guard. NOTE: Upstream comments indicate "this is being treated as a non-security bug and no real threat.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-1010023
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Libc current is affected by: Re-mapping current loaded library with malicious ELF file. The impact is: In worst case attacker may evaluate privileges. The component is: libld. The attack vector is: Attacker sends 2 ELF files to victim and asks to run ldd on it. ldd execute code. NOTE: Upstream comments indicate "this is being treated as a non-security bug and no real threat.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-1010024
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Libc current is affected by: Mitigation bypass. The impact is: Attacker may bypass ASLR using cache of thread stack and heap. The component is: glibc. NOTE: Upstream comments indicate "this is being treated as a non-security bug and no real threat.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-1010025
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Libc current is affected by: Mitigation bypass. The impact is: Attacker may guess the heap addresses of pthread_created thread. The component is: glibc. NOTE: the vendor's position is "ASLR bypass itself is not a vulnerability.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-9192
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: In the GNU C Library (aka glibc or libc6) through 2.29, check_dst_limits_calc_pos_1 in posix/regexec.c has Uncontrolled Recursion, as demonstrated by '(|)(\\1\\1)*' in grep, a different issue than CVE-2018-20796. NOTE: the software maintainer disputes that this is a vulnerability because the behavior occurs only with a crafted pattern
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2021-45346
- Severity before → after: not reported → LOW.
- Package/version before: not detected in this scan.
- Package/version after: pkg:deb/debian/sqlite3@3.46.1-7+deb13u2.
- Published fix before / after: not listed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A Memory Leak vulnerability exists in SQLite Project SQLite3 3.35.1 and 3.37.0 via maliciously crafted SQL Queries (made via editing the Database File), it is possible to query a record, and leak subsequent bytes of memory that extend beyond the record, which could let a malicious user obtain sensitive information. NOTE: The developer disputes this as a vulnerability stating that If you give SQLite a corrupted database file and submit a query against the database, it might read parts of the database that you did not intend or expect.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2022-0563
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: pkg:deb/debian/util-linux@2.41.5-0+deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in the util-linux chfn and chsh utilities when compiled with Readline support. The Readline library uses an "INPUTRC" environment variable to get a path to the library config file. When the library cannot parse the specified file, it prints an error message containing data from the file. This flaw allows an unprivileged user to read root-owned files, potentially leading to privilege escalation. This flaw affects util-linux versions prior to 2.37.4.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2023-31437
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/systemd@252.39-1~deb12u2.
- Package/version after: pkg:deb/debian/systemd@257.13-1~deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: An issue was discovered in systemd 253. An attacker can modify a sealed log file such that, in some views, not all existing and sealed log messages are displayed. NOTE: the vendor reportedly sent "a reply denying that any of the finding was a security vulnerability."
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2023-31438
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/systemd@252.39-1~deb12u2.
- Package/version after: pkg:deb/debian/systemd@257.13-1~deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: An issue was discovered in systemd 253. An attacker can truncate a sealed log file and then resume log sealing such that checking the integrity shows no error, despite modifications. NOTE: the vendor reportedly sent "a reply denying that any of the finding was a security vulnerability."
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2023-31439
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/systemd@252.39-1~deb12u2.
- Package/version after: pkg:deb/debian/systemd@257.13-1~deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: An issue was discovered in systemd 253. An attacker can modify the contents of past events in a sealed log file and then adjust the file such that checking the integrity shows no error, despite modifications. NOTE: the vendor reportedly sent "a reply denying that any of the finding was a security vulnerability."
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2025-5278
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/coreutils@9.1-1.
- Package/version after: pkg:deb/debian/coreutils@9.7-3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in GNU Coreutils. The sort utility's begfield() function is vulnerable to a heap buffer under-read. The program may access memory outside the allocated buffer if a user runs a crafted command using the traditional key format. A malicious input could lead to a crash or leak sensitive data.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2025-70873
- Severity before → after: not reported → LOW.
- Package/version before: not detected in this scan.
- Package/version after: pkg:deb/debian/sqlite3@3.46.1-7+deb13u2.
- Published fix before / after: not listed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: An information disclosure issue in the zipfileInflate function in the zipfile extension in SQLite v3.51.1 and earlier allows attackers to obtain heap memory via supplying a crafted ZIP file.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-102473
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/dash@0.5.12-2.
- Package/version after: pkg:deb/debian/dash@0.5.12-12.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in dash. When built without libc fnmatch, the internal pmatch() matcher implements * by unbounded recursion over candidate positions. A local user who can plant filenames, or otherwise feed that matcher, can make a short multi-star pattern such as *.*.*.*.*.tar.gz consume excessive CPU.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-102474
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/dash@0.5.12-2.
- Package/version after: pkg:deb/debian/dash@0.5.12-12.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in dash. The printf builtin reserves four bytes before converting a Unicode \u or \U escape, but the multi-byte token can need five or six bytes. A local user who can supply such an escape to dash printf or echo %b, including through dash -c and a positional argument, can write one or two bytes past that reservation.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-53910
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/diffutils@1:3.8-4.
- Package/version after: pkg:deb/debian/diffutils@1:3.10-4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: diff3 tool from GNU diffutils is vulnerable to a heap‑based buffer overflow due to multiple signed integer overflows in line‑mapping calculations. Incorrect arithmetic in mapping line ranges can result in corrupted values being used for memory allocation and loop bounds. When processing crafted diff output, these overflows may cause the application to allocate insufficient memory and subsequently perform out‑of‑bounds writes during internal processing. An attacker who can control the output of the diff program used by diff3 (e.g. via --diff-program pointing to a malicious script) can trigger out-of-bounds writes, resulting in a crash and potentially remote code execution depending on the environment. This issue has been fixed in commit 9ff04d5b84743e331e80b589335a52c5480d1815 NOTE: The project maintainers claim that this is not a security issue. They state that the worst outcome this iss
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-56391
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/coreutils@9.1-1.
- Package/version after: pkg:deb/debian/coreutils@9.7-3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU coreutils uniq is vulnerable to an out‑of‑bounds read due to incorrect handling of multibyte input when the -w (--check-chars) option is used. The find_field() function miscalculates the byte length of characters by repeatedly processing a fixed pointer instead of advancing through the input, resulting in an inflated length value. This incorrect length is later used in a memcmp operation, causing reads beyond the allocated buffer when processing crafted multibyte input. When running GNU coreutils uniq with attacker-provided arguments, this behavior leads to a crash and potential adjacent heap memory exposure. This issue has been fixed in the commit d64e35a8a4c0e4608321433e0d84d917e4e36371.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-56392
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/coreutils@9.1-1.
- Package/version after: pkg:deb/debian/coreutils@9.7-3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU coreutils unexpand is vulnerable to a heap-based buffer overflow due to an integer overflow during buffer allocation when processing large tab stop (-t) values. The multiplication used to calculate the allocation size can wrap around, resulting in an undersized buffer. When processing crafted input, subsequent writes exceed the allocated memory, leading to an out‑of‑bounds heap write. When running GNU coreutils unexpand with attacker-provided large tab stop (-t) arguments, this behavior leads to a crash and potentially achieve a heap write primitive depending on memory layout. This issue has been fixed in the commit b60a159fdc5bfcf9988d3a4cb6f53abe8ad5d35d
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2025-45582
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/debian/tar@1.34+dfsg-1.2+deb12u1.
- Package/version after: pkg:deb/debian/tar@1.35+dfsg-3.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Tar through 1.35 allows file overwrite via directory traversal in crafted TAR archives, with a certain two-step process. First, the victim must extract an archive that contains a ../ symlink to a critical directory. Second, the victim must extract an archive that contains a critical file, specified via a relative pathname that begins with the symlink name and ends with that critical file's name. Here, the extraction follows the symlink and overwrites the critical file. This bypasses the protection mechanism of "Member name contains '..'" that would occur for a single TAR archive that attempted to specify the critical file via a ../ approach. For example, the first archive can contain "x -> ../../../../../home/victim/.ssh" and the second archive can contain x/authorized_keys. This can affect server applications that automatically extract any number of user-supplied TAR archives, and w
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

## development

Before: 65 total: {"CRITICAL":0,"HIGH":13,"MEDIUM":13,"LOW":39,"UNSPECIFIED":0}
After: 28 total: {"CRITICAL":0,"HIGH":1,"MEDIUM":1,"LOW":26,"UNSPECIFIED":0}

### CVE-2026-53613
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: util-linux is a random collection of Linux utilities. In util-linux 2.17 through 2.41.6 and 2.42 through 2.42.3, and in 2.42.4 when the legacy `mount(2)` path is used without `/proc`, restricted non-root `mount` requests validate an `/etc/fstab` target before the mount operation re-resolves that pathname. A local low-privileged user authorized by an fstab `user` or `users` entry whose target has an attacker-writable ancestor can use `renameat2(RENAME_EXCHANGE)` to swap a path component and redirect an authorized mount to a root-owned location, such as mounting attacker-controlled content over `/etc/sudoers.d`, and thereby gain root privileges. Versions 2.41.5 and 2.42.2 pin targets for the new mount API, and 2.42.4 pins legacy targets through `/proc/self/fd`; the documented legacy fallback without `/proc` remains affected.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78409
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: The X-mount.subdir option uses a detached-tree fast path on Linux 6.15 and later and passes the configured subdirectory to open_tree() with AT_SYMLINK_NOFOLLOW. That flag does not stop intermediate symlink traversal or keep resolution inside the newly mounted filesystem. A local unprivileged user with an fstab-authorized X-mount.subdir entry can attach a host path at the intended mountpoint.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-102276
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/brace-expansion@5.0.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 5.0.10 / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: ### Summary
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-102278
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/brace-expansion@5.0.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 5.0.11 / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: ### Summary
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-109869
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/undici@6.28.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 6.29.1 / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: ### Impact
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-19534
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/undici@6.28.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 6.28.1 / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: ### Impact
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-82560
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/perl@5.36.0-7+deb12u4.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: Pod::Text versions before 6.1.1 for Perl allow CPU and memory exhaustion formatting a POD document whose =over nesting drives the margin to the output width. Each =over adds its indent to the margin, which wrap() subtracts from the output width to get the space available for text. When that space reaches zero, the line-splitting substitution matches the empty string, and the loop consumes no input while appending the margin padding on every pass. Formatting an attacker-supplied POD document never returns, and the output grows until memory is exhausted.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78410
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in util-linux. Restricted bind mounts take the source path from fstab but do not pin that source before the privileged mount. A local unprivileged user who can replace the authorized source or a writable ancestor can redirect SUID mount(8) to bind another host directory. If the fstab entry also sets X-mount.owner, X-mount.group, or X-mount.mode, root then changes ownership or mode on that redirected inode.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78408
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: The nsenter --join-cgroup option opens the target cgroup.procs file as root and leaves that file descriptor open across later namespace and credential changes and across execve(). Because the kernel checks later cgroup migrations using the credentials from the original open, a program run in an attacker-controlled target can inherit root's ability to move host processes between cgroups. After a privileged operator uses --join-cgroup against that target, an unprivileged user can migrate and terminate unrelated root processes.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-53615
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: util-linux is a random collection of Linux utilities. Before util-linux 2.41.4, `parse_dos_extended()` in `libblkid/src/partitions/dos.c` computes an extended-partition start sector with 32-bit addition and does not apply the extended-area bounds checks to the first two EBR entries. A local attacker who causes a crafted DOS extended-partition disk image or removable medium to be probed can wrap `cur_start + start` to sector zero and cause libblkid to report a false partition overlapping the MBR. This directly compromises the integrity of the reported partition metadata; disk modification or availability loss requires a separate downstream consumer to act on that metadata. This issue is fixed in 2.41.4.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-85091
- Severity before → after: HIGH → HIGH.
- Package/version before: pkg:deb/debian/zlib@1:1.2.13.dfsg-1.
- Package/version after: pkg:deb/debian/zlib@1:1.3.dfsg+really1.3.1-1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: zlib versions 1.3.1.2 through 1.3.2 contain a heap buffer overflow vulnerability in the gz_vacate() function when processing non-blocking gzwrite() operations with stale external buffer pointers. Attackers can trigger the overflow by calling gzprintf() or gzvprintf() after a write stall, causing an unchecked memmove() to write beyond the internal input buffer boundary.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-76642
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: util-linux versions through 2.41.5 and 2.42.2 fail to check mount helper exit status before running post-mount hooks, allowing unprivileged users to execute privileged operations on pre-existing filesystems. Attackers can exploit X-mount.idmap or X-mount.owner hooks to clone filesystems with inherited suid bits or modify target inode permissions after a helper fails, achieving privilege escalation.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-93748
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/http-cache-semantics@4.2.0.
- Package/version after: not detected in this scan.
- Published fix before / after: not fixed / not applicable.
- Origin: Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.
- Advisory context: http-cache-semantics through 4.2.0 fails to properly validate security-zeroed cache entries when processing client max-stale directives, allowing unauthenticated attackers to retrieve cached responses belonging to other users. Attackers can request the same URL with a large max-stale value to obtain another user's Set-Cookie session credentials from shared-cache entries that were deliberately zeroed for security reasons.
- Exposure: Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.
- Decision: Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2005-2541
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/tar@1.34+dfsg-1.2+deb12u1.
- Package/version after: pkg:deb/debian/tar@1.35+dfsg-3.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: Tar 1.15.1 does not properly warn the user when extracting setuid or setgid files, which may allow local users or remote attackers to gain privileges.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2007-5686
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/shadow@1:4.13+dfsg1-1+deb12u2.
- Package/version after: pkg:deb/debian/shadow@1:4.17.4-2.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: initscripts in rPath Linux 1 sets insecure permissions for the /var/log/btmp file, which allows local users to obtain sensitive information regarding authentication attempts. NOTE: because sshd detects the insecure permissions and does not log certain events, this also prevents sshd from logging failed authentication attempts by remote attackers.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2010-0928
- Severity before → after: not reported → LOW.
- Package/version before: not detected in this scan.
- Package/version after: pkg:deb/debian/openssl@3.5.7-1~deb13u3.
- Published fix before / after: not listed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: OpenSSL 0.9.8i on the Gaisler Research LEON3 SoC on the Xilinx Virtex-II Pro FPGA uses a Fixed Width Exponentiation (FWE) algorithm for certain signature calculations, and does not verify the signature before providing it to a caller, which makes it easier for physically proximate attackers to determine the private key via a modified supply voltage for the microprocessor, related to a "fault-based attack."
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2010-4756
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: The glob implementation in the GNU C Library (aka glibc or libc6) allows remote authenticated users to cause a denial of service (CPU and memory consumption) via crafted glob expressions that do not match any pathnames, as demonstrated by glob expressions in STAT commands to an FTP daemon, a different vulnerability than CVE-2010-2632.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2011-3374
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/apt@2.6.1.
- Package/version after: pkg:deb/debian/apt@3.0.3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: It was found that apt-key in apt, all versions, do not correctly validate gpg keys with the master keyring, leading to a potential man-in-the-middle attack.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2011-4116
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/perl@5.36.0-7+deb12u4.
- Package/version after: pkg:deb/debian/perl@5.40.1-6+deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: _is_safe in the File::Temp module for Perl does not properly handle symlinks.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2013-4392
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/systemd@252.39-1~deb12u2.
- Package/version after: pkg:deb/debian/systemd@257.13-1~deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: systemd, when updating file permissions, allows local users to change the permissions and SELinux security contexts for arbitrary files via a symlink attack on unspecified files.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2017-18018
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/coreutils@9.1-1.
- Package/version after: pkg:deb/debian/coreutils@9.7-3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: In GNU Coreutils through 8.29, chown-core.c in chown and chgrp does not prevent replacement of a plain file with a symlink during use of the POSIX "-R -L" options, which allows local users to modify the ownership of arbitrary files by leveraging a race condition.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2018-20796
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: In the GNU C Library (aka glibc or libc6) through 2.29, check_dst_limits_calc_pos_1 in posix/regexec.c has Uncontrolled Recursion, as demonstrated by '(\227|)(\\1\\1|t1|\\\2537)+' in grep.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-1010022
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Libc current is affected by: Mitigation bypass. The impact is: Attacker may bypass stack guard protection. The component is: nptl. The attack vector is: Exploit stack buffer overflow vulnerability and use this bypass vulnerability to bypass stack guard. NOTE: Upstream comments indicate "this is being treated as a non-security bug and no real threat.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-1010023
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Libc current is affected by: Re-mapping current loaded library with malicious ELF file. The impact is: In worst case attacker may evaluate privileges. The component is: libld. The attack vector is: Attacker sends 2 ELF files to victim and asks to run ldd on it. ldd execute code. NOTE: Upstream comments indicate "this is being treated as a non-security bug and no real threat.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-1010024
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Libc current is affected by: Mitigation bypass. The impact is: Attacker may bypass ASLR using cache of thread stack and heap. The component is: glibc. NOTE: Upstream comments indicate "this is being treated as a non-security bug and no real threat.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-1010025
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Libc current is affected by: Mitigation bypass. The impact is: Attacker may guess the heap addresses of pthread_created thread. The component is: glibc. NOTE: the vendor's position is "ASLR bypass itself is not a vulnerability.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2019-9192
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/glibc@2.36-9+deb12u14.
- Package/version after: pkg:deb/debian/glibc@2.41-12+deb13u4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: In the GNU C Library (aka glibc or libc6) through 2.29, check_dst_limits_calc_pos_1 in posix/regexec.c has Uncontrolled Recursion, as demonstrated by '(|)(\\1\\1)*' in grep, a different issue than CVE-2018-20796. NOTE: the software maintainer disputes that this is a vulnerability because the behavior occurs only with a crafted pattern
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2021-45346
- Severity before → after: not reported → LOW.
- Package/version before: not detected in this scan.
- Package/version after: pkg:deb/debian/sqlite3@3.46.1-7+deb13u2.
- Published fix before / after: not listed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A Memory Leak vulnerability exists in SQLite Project SQLite3 3.35.1 and 3.37.0 via maliciously crafted SQL Queries (made via editing the Database File), it is possible to query a record, and leak subsequent bytes of memory that extend beyond the record, which could let a malicious user obtain sensitive information. NOTE: The developer disputes this as a vulnerability stating that If you give SQLite a corrupted database file and submit a query against the database, it might read parts of the database that you did not intend or expect.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2022-0563
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/util-linux@2.38.1-5+deb12u3.
- Package/version after: pkg:deb/debian/util-linux@2.41.5-0+deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in the util-linux chfn and chsh utilities when compiled with Readline support. The Readline library uses an "INPUTRC" environment variable to get a path to the library config file. When the library cannot parse the specified file, it prints an error message containing data from the file. This flaw allows an unprivileged user to read root-owned files, potentially leading to privilege escalation. This flaw affects util-linux versions prior to 2.37.4.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2023-31437
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/systemd@252.39-1~deb12u2.
- Package/version after: pkg:deb/debian/systemd@257.13-1~deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: An issue was discovered in systemd 253. An attacker can modify a sealed log file such that, in some views, not all existing and sealed log messages are displayed. NOTE: the vendor reportedly sent "a reply denying that any of the finding was a security vulnerability."
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2023-31438
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/systemd@252.39-1~deb12u2.
- Package/version after: pkg:deb/debian/systemd@257.13-1~deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: An issue was discovered in systemd 253. An attacker can truncate a sealed log file and then resume log sealing such that checking the integrity shows no error, despite modifications. NOTE: the vendor reportedly sent "a reply denying that any of the finding was a security vulnerability."
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2023-31439
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/systemd@252.39-1~deb12u2.
- Package/version after: pkg:deb/debian/systemd@257.13-1~deb13u1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: An issue was discovered in systemd 253. An attacker can modify the contents of past events in a sealed log file and then adjust the file such that checking the integrity shows no error, despite modifications. NOTE: the vendor reportedly sent "a reply denying that any of the finding was a security vulnerability."
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2025-5278
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/coreutils@9.1-1.
- Package/version after: pkg:deb/debian/coreutils@9.7-3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in GNU Coreutils. The sort utility's begfield() function is vulnerable to a heap buffer under-read. The program may access memory outside the allocated buffer if a user runs a crafted command using the traditional key format. A malicious input could lead to a crash or leak sensitive data.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2025-70873
- Severity before → after: not reported → LOW.
- Package/version before: not detected in this scan.
- Package/version after: pkg:deb/debian/sqlite3@3.46.1-7+deb13u2.
- Published fix before / after: not listed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: An information disclosure issue in the zipfileInflate function in the zipfile extension in SQLite v3.51.1 and earlier allows attackers to obtain heap memory via supplying a crafted ZIP file.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-102473
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/dash@0.5.12-2.
- Package/version after: pkg:deb/debian/dash@0.5.12-12.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in dash. When built without libc fnmatch, the internal pmatch() matcher implements * by unbounded recursion over candidate positions. A local user who can plant filenames, or otherwise feed that matcher, can make a short multi-star pattern such as *.*.*.*.*.tar.gz consume excessive CPU.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-102474
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/dash@0.5.12-2.
- Package/version after: pkg:deb/debian/dash@0.5.12-12.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: A flaw was found in dash. The printf builtin reserves four bytes before converting a Unicode \u or \U escape, but the multi-byte token can need five or six bytes. A local user who can supply such an escape to dash printf or echo %b, including through dash -c and a positional argument, can write one or two bytes past that reservation.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-53910
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/diffutils@1:3.8-4.
- Package/version after: pkg:deb/debian/diffutils@1:3.10-4.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: diff3 tool from GNU diffutils is vulnerable to a heap‑based buffer overflow due to multiple signed integer overflows in line‑mapping calculations. Incorrect arithmetic in mapping line ranges can result in corrupted values being used for memory allocation and loop bounds. When processing crafted diff output, these overflows may cause the application to allocate insufficient memory and subsequently perform out‑of‑bounds writes during internal processing. An attacker who can control the output of the diff program used by diff3 (e.g. via --diff-program pointing to a malicious script) can trigger out-of-bounds writes, resulting in a crash and potentially remote code execution depending on the environment. This issue has been fixed in commit 9ff04d5b84743e331e80b589335a52c5480d1815 NOTE: The project maintainers claim that this is not a security issue. They state that the worst outcome this iss
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-56391
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/coreutils@9.1-1.
- Package/version after: pkg:deb/debian/coreutils@9.7-3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU coreutils uniq is vulnerable to an out‑of‑bounds read due to incorrect handling of multibyte input when the -w (--check-chars) option is used. The find_field() function miscalculates the byte length of characters by repeatedly processing a fixed pointer instead of advancing through the input, resulting in an inflated length value. This incorrect length is later used in a memcmp operation, causing reads beyond the allocated buffer when processing crafted multibyte input. When running GNU coreutils uniq with attacker-provided arguments, this behavior leads to a crash and potential adjacent heap memory exposure. This issue has been fixed in the commit d64e35a8a4c0e4608321433e0d84d917e4e36371.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-56392
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/debian/coreutils@9.1-1.
- Package/version after: pkg:deb/debian/coreutils@9.7-3.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU coreutils unexpand is vulnerable to a heap-based buffer overflow due to an integer overflow during buffer allocation when processing large tab stop (-t) values. The multiplication used to calculate the allocation size can wrap around, resulting in an undersized buffer. When processing crafted input, subsequent writes exceed the allocated memory, leading to an out‑of‑bounds heap write. When running GNU coreutils unexpand with attacker-provided large tab stop (-t) arguments, this behavior leads to a crash and potentially achieve a heap write primitive depending on memory layout. This issue has been fixed in the commit b60a159fdc5bfcf9988d3a4cb6f53abe8ad5d35d
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2025-45582
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/debian/tar@1.34+dfsg-1.2+deb12u1.
- Package/version after: pkg:deb/debian/tar@1.35+dfsg-3.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.
- Advisory context: GNU Tar through 1.35 allows file overwrite via directory traversal in crafted TAR archives, with a certain two-step process. First, the victim must extract an archive that contains a ../ symlink to a critical directory. Second, the victim must extract an archive that contains a critical file, specified via a relative pathname that begins with the symlink name and ends with that critical file's name. Here, the extraction follows the symlink and overwrites the critical file. This bypasses the protection mechanism of "Member name contains '..'" that would occur for a single TAR archive that attempted to specify the critical file via a ../ approach. For example, the first archive can contain "x -> ../../../../../home/victim/.ssh" and the second archive can contain x/authorized_keys. This can affect server applications that automatically extract any number of user-supplied TAR archives, and w
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

## mongo

Before: 231 total: {"CRITICAL":11,"HIGH":43,"MEDIUM":140,"LOW":35,"UNSPECIFIED":2}
After: 28 total: {"CRITICAL":0,"HIGH":0,"MEDIUM":26,"LOW":2,"UNSPECIFIED":0}

### CVE-2026-84782
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:deb/ubuntu/openssl@3.0.13-0ubuntu3.11.
- Package/version after: not detected in this scan.
- Published fix before / after: 3.0.13-0ubuntu3.16 / not applicable.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: Issue summary: The DTLS retransmission logic does not correctly handle a handshake message write that is suspended part-way through. The retransmitted message can be read past the message buffer and the retransmission overwrites the internal state the suspended write needs to resume correctly. Impact summary: The retransmitted message can disclose a heap memory to the peer as plaintext handshake data or cause a crash and a Denial of Service when the read reaches an unmapped memory region. CWE: CWE-125: Out-of-bounds Read Description: DTLS handshake messages can be written out in multiple fragments, and a write can suspend mid-message (returning WANT_WRITE) if the underlying transport temporarily cannot accept more data. While such a write is suspended, the DTLS retransmission timer may independently fire and ask the retransmission logic to resend an earlier, already-acknowledged-as-sent
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2025-58187
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.24.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Due to the design of the name constraint checking algorithm, the processing time of some inputs scale non-linearly with respect to the size of the certificate.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2025-58188
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.24.8 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Validating certificate chains which contain DSA public keys can cause programs to panic, due to a interface cast that assumes they implement the Equal method.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2025-61723
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.24.8 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The processing time for parsing some invalid inputs scales non-linearly with respect to the size of the input.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2025-61725
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.24.8 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The ParseAddress function constructs domain-literal address components through repeated string concatenation. When parsing large domain-literal components, this can cause excessive CPU consumption.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2025-61726
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.24.12 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The net/url package does not set a limit on the number of query parameters in a query.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2025-61729
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.24.11 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Within HostnameError.Error(), when constructing an error string, there is no limit to the number of hosts that will be printed out. Furthermore, the error string is constructed by repeated string concatenation, leading to quadratic runtime. Therefore, a certificate provided by a malicious actor can result in excessive resource consumption.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-25679
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.8 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: url.Parse insufficiently validated the host/authority component and accepted some invalid URLs.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-32280
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: During chain building, the amount of work that is done is not correctly limited when a large number of intermediate certificates are passed in VerifyOptions.Intermediates, which can lead to a denial of service. This affects both direct users of crypto/x509 and users of crypto/tls.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-32281
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Validating certificate chains which use policies is unexpectedly inefficient when certificates in the chain contain a very large number of policy mappings, possibly causing denial of service.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-32283
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: If one side of the TLS connection sends multiple key update messages post-handshake in a single record, the connection can deadlock, causing uncontrolled consumption of resources. This can lead to a denial of service.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-33811
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.10 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When using LookupCNAME with the cgo DNS resolver, a very long CNAME response can trigger a double-free of C memory and a crash.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-33814
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/net@0.47.0; pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.10 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When processing HTTP/2 SETTINGS frames, transport will enter an infinite loop of writing CONTINUATION frames if it receives a SETTINGS_MAX_FRAME_SIZE with a value of 0.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-33818
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.13 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Enforce a recursion limit in Unmarshal to prevent stack exhaustion when parsing deeply-nested, recursive structures.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39820
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.10 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Well-crafted inputs reaching ParseAddress, ParseAddressList, and ParseDate were able to trigger excessive CPU exhaustion and memory allocations.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39829
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The RSA and DSA public key parsers did not enforce size limits on key parameters. A crafted public key with an excessively large modulus or DSA parameter could cause several minutes of CPU consumption during signature verification. This could be triggered by unauthenticated clients during public key authentication. RSA moduli are now limited to 8192 bits, and DSA parameters are validated per FIPS 186-2.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39836
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.10 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The Dial and LookupPort functions panic on Windows when provided with an input containing a NUL (0).
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-42499
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.10 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Pathological inputs could cause DoS through consumePhrase when parsing an email address according to RFC 5322.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-42504
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.11 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Decoding a maliciously-crafted MIME header containing many invalid encoded-words can consume excessive CPU.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-46597
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: An incorrectly placed cast from bytes to int allowed for server-side panic in the AES-GCM packet decoder for well-crafted inputs.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-46600
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/net@0.47.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.56.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Parsing an invalid SVCB or HTTPS RR can panic when the size of a parameter value overflows the message buffer.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56851
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/text@0.31.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.41.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The Nickname profile can panic with an out-of-bounds slice error when transforming crafted input into a short destination buffer.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56852
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/text@0.31.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.39.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: A norm.Iter can enter an infinite loop when handling input containing invalid UTF-8 bytes.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56853
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.13 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When a server is configured to support unencrypted HTTP/2, it reads a few bytes from each new connection to see if they contain the HTTP/2 client preface. ReadHeaderTimeout is unexpectedly not being applied when doing this.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56854
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.55.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The source-address critical option in the Permissions returned by an authentication callback was only enforced for the PublicKeyCallback and VerifiedPublicKeyCallback paths, extending the fix for CVE-2026-46595. Permissions returned by the PasswordCallback, KeyboardInteractiveCallback, NoClientAuthCallback, and GSSAPIWithMICConfig.AllowLogin callbacks were not validated against the client's remote address, so a source-address restriction set by those callbacks was silently ignored. The check is now applied to the Permissions returned by any authentication callback.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56855
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.56.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Previously, after a channel has been established, a malicious peer could send crafted messages that would deadlock the entire connection.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56859
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.13 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Previously, DecodeElement would reset the depth counter causing it to never fire; this could lead to stack exhaustion.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56862
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.13 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Handshake messages, such as KeyUpdate, are always considered as state-advancing, regardless of whether a handshake has been completed or not. As a result, a malicious client can keep sending KeyUpdate messages to force the server to keep performing key derivation operations indefinitely.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56866
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When http.Transport sends an HTTP/1 CONNECT request with a non-empty Request.Body, it writes the body directly to the connection without framing after the request headers. If the server rejects the CONNECT request with a non-2xx keep-alive response, Transport returns the connection to the idle pool. Because CONNECT requests do not have a request body, the server may interpret the trailing body bytes as a subsequent pipelined HTTP/1.1 request on the connection, leaving the pooled connection desynchronized and causing the next caller that reuses it to read the response to the injected request. In reverse proxies (including httputil.ReverseProxy) that forward CONNECT requests through a shared Transport, this can lead to cross-user response poisoning.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-59869
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/js-yaml@3.13.1.
- Package/version after: not detected in this scan.
- Published fix before / after: 3.15.0 / not applicable.
- Origin: Official init helper parser under /opt/js-yaml and /js-yaml.js, not application package-lock.
- Advisory context: ### Impact
- Exposure: Config parsing/automatic init path; not required by explicit mongod command or mongosh RS administration.
- Decision: Remove automatic init entrypoint/parser; reject MONGO_INITDB_* and init scripts explicitly. mongod itself still supports operator-managed configuration, auth, keyfiles and TLS. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-63209
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/github.com/klauspost/compress@1.17.8.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.18.7 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: # Signed Integer Overflow in s2.NewDict
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78659
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/net@0.47.0; pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When "Trailer" headers are sent by a client, the HTTP server internally uses the header values to populate the Request.Trailer map passed to the server handler. Because Request.Trailer is a map, each entry incurs memory overhead. For HTTP/2 servers, a malicious client can exploit this by sending a "Trailer" header that declares a large number of fields, causing the server to allocate a disproportionate amount of memory while bypassing Server.MaxHeaderValueCount and Server.MaxHeaderBytes limits. This exploit is not applicable for HTTP/1 servers, which do not support multiplexing a large number of requests over one TCP connection, and whose Server.MaxHeaderBytes are calculated differently.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78660
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/net@0.47.0; pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Historically, we have been rather lax about malformed framing-related headers in our HTTP/2 implementation, as they cannot interfere with HTTP/2 framing. However, this makes it possible for our HTTP/2 implementation to forward responses containing such headers to an HTTP/1 client when acting as a reverse proxy. If the HTTP/1 client also does not behave strictly enough, this can result in response smuggling.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78662
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.56.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Previously, a channel registered in the mux's chanList is not usable until it is established. A malicious peer was able flood the channel's incomingRequests, deadlocking the entire connection.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78667
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When parsing a Range header containing a large number of small ranges, FileServer(FS), ServeContent, and ServeFile(FS) can consume an excessive amount of CPU.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78669
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/net@0.47.0; pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: A malicious HTTP/2 peer can cause excessive CPU consumption in the client or server by opening a large number of streams and then sending many small SETTINGS frames containing SETTINGS_INITIAL_WINDOW_SIZE values.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-84375
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/js-yaml@3.13.1.
- Package/version after: not detected in this scan.
- Published fix before / after: 3.15.2 / not applicable.
- Origin: Official init helper parser under /opt/js-yaml and /js-yaml.js, not application package-lock.
- Advisory context: ## Summary
- Exposure: Config parsing/automatic init path; not required by explicit mongod command or mongosh RS administration.
- Decision: Remove automatic init entrypoint/parser; reject MONGO_INITDB_* and init scripts explicitly. mongod itself still supports operator-managed configuration, auth, keyfiles and TLS. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-94439
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When an HTTP server handler sends a 2xx response to an HTTP/1 CONNECT request and returns without hijacking the connection, the server improperly continues to read and serve requests from the connection. Since a 2xx response to an HTTP/1 CONNECT converts the connection into a tunnel, the server should not treat the connection as continuing to contain HTTP.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-94440
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Parsing a multipart form can bypass memory limits and read an arbitrarily long line into memory when the remaining limit at the start of a part is less than 400 bytes.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-97031
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Multiple ECH outer extension references are not permitted under RFC 9849; previously, a client could send a well-crafted packet that could trigger memory exhaustion in the server process by specifying multiple references.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-97032
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/golang.org/x/net@0.47.0; pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: HTTP/2 servers could end up crashing due to inadvertently modifying its HPACK encoder concurrently. This happens because the server modifies the HPACK encoder from two goroutines without synchronization: one uses the encoder to encode a HEADERS frame as part of a response sent to a client and the other modifies the encoder's table size when handling a SETTINGS frame containing SETTINGS_HEADER_TABLE_SIZE that a client sends. A malicious client can repeatedly send a request while changing the header table size to crash the server.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### GHSA-5p4m-2wfm-xmqj
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:npm/js-yaml@3.13.1.
- Package/version after: not detected in this scan.
- Published fix before / after: 3.15.1 / not applicable.
- Origin: Official init helper parser under /opt/js-yaml and /js-yaml.js, not application package-lock.
- Advisory context: # Quadratic CPU consumption in `!!omap` resolution (js-yaml 3.x and 4.x)
- Exposure: Config parsing/automatic init path; not required by explicit mongod command or mongosh RS administration.
- Decision: Remove automatic init entrypoint/parser; reject MONGO_INITDB_* and init scripts explicitly. mongod itself still supports operator-managed configuration, auth, keyfiles and TLS. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39822
- Severity before → after: HIGH → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.12 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: On Unix systems, opening a file in an os.Root improperly follows symlinks to locations outside of the Root when the final path component of the a path is a symbolic link and the path ends in /.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39830
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: A malicious SSH peer could send unsolicited global request responses to fill an internal buffer, blocking the connection's read loop. The blocked goroutine could not be released by calling Close(), resulting in a resource leak per connection. Unsolicited global responses are now discarded.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39831
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The Verify() method for FIDO/U2F security key types (sk-ecdsa-sha2-nistp256@openssh.com, sk-ssh-ed25519@openssh.com) did not check the User Presence flag. Signatures generated without physical touch were accepted, allowing unattended use of a hardware security key. To restore the previous behavior, return a "no-touch-required" extension in Permissions.Extensions from PublicKeyCallback.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39832
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When adding a key to a remote agent constraint extensions such as restrict-destination-v00@openssh.com were not serialized in the request. Destination restrictions were silently stripped when forwarding keys, allowing unrestricted use of the key on the remote host. The client now serializes all constraint extensions. Additionally, the in-memory keyring returned by NewKeyring() now rejects keys with unsupported constraint extensions instead of silently ignoring them.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39833
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The in-memory keyring returned by NewKeyring() silently accepted keys with the ConfirmBeforeUse constraint but never enforced it. The key would sign without any confirmation prompt, with no indication to the caller that the constraint was not in effect. NewKeyring() now returns an error when unsupported constraints are requested.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39834
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: When writing data larger than 4GB in a single Write call on an SSH channel, an integer overflow in the internal payload size calculation caused the write loop to spin indefinitely, sending empty packets without making progress. The size comparison now uses int64 to prevent truncation.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-42508
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Previously, a revoked 'SignatureKey' belonging to a CA was not correctly checked for revocation. Now, both the 'key' and 'key.SignatureKey' are checked for @revoked.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-78663
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/net@0.47.0; pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The HTTP/2 server can refund connection-level flow control twice for the same data: Once when a client resets a stream (refunding data for any sent-but-unread portion of the stream), and again when a request handler reads the buffered data. A malicious client can exploit this to bypass the configured connection-level flow control limit (MaxReceiveBufferPerConnection). Total buffered data is still limited by the concurrent stream limit and stream-level flow control.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-39821
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/net@0.47.0; pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.25.13 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: The ToASCII and ToUnicode functions incorrectly accept Punycode-encoded labels that decode to an ASCII-only label. For example, ToUnicode("xn--example-.com") incorrectly returns the name "example.com" rather than an error.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-56857
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6; pkg:golang/stdlib@1.25.9.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.26.9 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: On Windows, when the target of Root.Mkdir or Root.MkdirAll is a junction pointing to an empty location, the operation can create a directory at the junction target even when that target is located outside the root. This only applies to operations where the last path component is a junction (path/to/junction, but not path/junction/target).
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2025-68121
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/stdlib@1.24.6.
- Package/version after: not detected in this scan.
- Published fix before / after: 1.24.13 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: During session resumption in crypto/tls, if the underlying Config has its ClientCAs or RootCAs fields mutated between the initial handshake and the resumed handshake, the resumed handshake may succeed when it should have failed. This may happen when a user calls Config.Clone and mutates the returned Config, or uses Config.GetConfigForClient. This can cause a client to resume a session with a server that it would not have resumed with during the initial handshake, or cause a server to resume a session with a client that it would not have resumed with during the initial handshake.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2026-46595
- Severity before → after: CRITICAL → not reported.
- Package/version before: pkg:golang/golang.org/x/crypto@0.45.0.
- Package/version after: not detected in this scan.
- Published fix before / after: 0.52.0 / not applicable.
- Origin: Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.
- Advisory context: Previously, CVE-2024-45337 fixed an authorization bypass for misused ssh server configurations; if any other type of callback is passed other than public key, then the source-address validation would be skipped.
- Exposure: Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.
- Decision: Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here. No longer reported in final artifact; this is not a claim that every historical upstream version was patched.

### CVE-2024-56433
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/ubuntu/shadow@1:4.13+dfsg1-4ubuntu3.2.
- Package/version after: pkg:deb/ubuntu/shadow@1:4.13+dfsg1-4ubuntu3.2.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: shadow-utils (aka shadow) 4.4 through 4.17.0 establishes a default /etc/subuid behavior (e.g., uid 100000 through 165535 for the first user account) that can realistically conflict with the uids of users defined on locally administered networks, potentially leading to account takeover, e.g., by leveraging newuidmap for access to an NFS home directory (or same-host resources in the case of remote logins by these local network users). NOTE: it may also be argued that system administrators should not have assigned uids, within local networks, that are within the range that can occur in /etc/subuid.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-40228
- Severity before → after: LOW → LOW.
- Package/version before: pkg:deb/ubuntu/systemd@255.4-1ubuntu8.15.
- Package/version after: pkg:deb/ubuntu/systemd@255.4-1ubuntu8.17.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: In systemd 259, systemd-journald can send ANSI escape sequences to the terminals of arbitrary users when a "logger -p emerg" command is executed, if ForwardToWall=yes is set.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-102473
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/dash@0.5.12-6ubuntu5.
- Package/version after: pkg:deb/ubuntu/dash@0.5.12-6ubuntu5.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: A flaw was found in dash. When built without libc fnmatch, the internal pmatch() matcher implements * by unbounded recursion over candidate positions. A local user who can plant filenames, or otherwise feed that matcher, can make a short multi-star pattern such as *.*.*.*.*.tar.gz consume excessive CPU.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-102474
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/dash@0.5.12-6ubuntu5.
- Package/version after: pkg:deb/ubuntu/dash@0.5.12-6ubuntu5.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: A flaw was found in dash. The printf builtin reserves four bytes before converting a Unicode \u or \U escape, but the multi-byte token can need five or six bytes. A local user who can supply such an escape to dash printf or echo %b, including through dash -c and a positional argument, can write one or two bytes past that reservation.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-103111
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Package/version after: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: PCRE2 before 10.49, when there is an attacker-controlled regular expression and certain JIT API usage, allows an out-of-bounds write with arbitrary data.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-107161
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/cyrus-sasl2@2.1.28+dfsg1-5ubuntu3.1.
- Package/version after: pkg:deb/ubuntu/cyrus-sasl2@2.1.28+dfsg1-5ubuntu3.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: A heap-based buffer overflow flaw was found in Cyrus SASL. The add_to_challenge() function in the DIGEST-MD5 plugin computes the size of the buffer needed for a challenge/response field before DIGEST-MD5 quoting is applied, but does not recompute that size when quoting (escaping special characters) makes the value longer. The under-sized buffer is then passed to strcat(), causing a heap-based out-of-bounds write whose size depends on attacker-controlled input. A malicious or on-path DIGEST-MD5 (or HTTP Digest) server can trigger this flaw in a connecting client by supplying a crafted challenge field, such as realm or nonce, most likely resulting in a crash of the client application.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-18374
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/glibc@2.39-0ubuntu8.7.
- Package/version after: pkg:deb/ubuntu/glibc@2.39-0ubuntu8.9.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: Passing an effectively empty string to the `,ccs=` syntax extension of the mode argument in the `fopen` function in the GNU C Library version 2.45 or earlier may result in a heap buffer overflow when the mode string input to the function is attacker controlled. This usage pattern is not seen in applications in common GNU/Linux distributions and applications that process user-supplied values for `ccs` should not pass them through without validation.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-18477
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/tar@1.35+dfsg-3build1.
- Package/version after: pkg:deb/ubuntu/tar@1.35+dfsg-3ubuntu0.4.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: A TOCTOU (Time-of-Check Time-of-Use) vulnerability in GNU tar's incremental dumpdir 'X' rename handling allows a local attacker with write access to a directory being backed up to influence the restore process if the attacker has access to the system where the restore is being performed. During restoration, files or directories may be created, renamed or overwritten outside the intended extraction directory. This could lead to unauthorized file modification or, in some cases, privilege escalation. Exploitation does not require the attacker to modify or craft the archive, and standard backup and restore workflows—including extracting into a newly created directory without using the -P option do not mitigate the issue.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-18508
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/tar@1.35+dfsg-3build1.
- Package/version after: pkg:deb/ubuntu/tar@1.35+dfsg-3ubuntu0.4.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: A flaw was found in GNU tar. When extracting an archive with the --one-top-level option, hardlink targets are not confined to the designated top-level directory and may resolve relative to the extraction working directory. A crafted archive can create hardlinks that escape the intended boundary and, when combined with a preexisting symbolic link under the working directory, may allow writing outside that boundary during a single extraction.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-2219
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/dpkg@1.22.6ubuntu6.6.
- Package/version after: pkg:deb/ubuntu/dpkg@1.22.6ubuntu6.6.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: It was discovered that dpkg-deb (a component of dpkg, the Debian package management system) does not properly validate the end of the data stream when uncompressing a zstd-compressed .deb archive, which may result in denial of service (infinite loop spinning the CPU).
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-41256
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Package/version after: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: jq is a command-line JSON processor. In 1.8.1 and earlier, Top-level jq programs loaded from a file with -f are truncated at the first embedded NUL byte on current upstream HEAD. A crafted filter file such as . followed by \x00 and arbitrary suffix compiles and executes as only the prefix before the NUL. This leaves jq with a post-CVE-2026-33948 prefix/full-buffer mismatch on the compilation path even though the JSON parser path has already been fixed.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-43895
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Package/version after: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: jq is a command-line JSON processor. In 1.8.1 and earlier, jq accepts embedded NUL bytes in import paths at the jq-language level, but later resolves those paths through C string operations during module and data-file lookup. This creates a mismatch between the logical import string that policy or audit code may validate and the on-disk path that jq actually opens.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-67693
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.5.
- Package/version after: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.6.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: An issue in gnutls v.3.8.13 allows an attacker to obtain sensitive information via failing to reject end-entity X.509 certificates that contain a contradictory combination of Key Usage (KU) and Extended Key Usage (EKU)
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-86145
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Package/version after: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: PCRE2 before 10.48 allows a pcre2_dfa_match out-of-bounds write because reuse of a cached workspace block, in a recursive DFA matching workspace, lacks a size check (even though a newly allocated block, for the same purpose, does have a size check). This outcome requires an attacker-controlled regular expression, or a recursive pattern in conjunction with a small heap limit (this can be set through the API).
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-88647
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.5.
- Package/version after: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.6.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: A hostname verification bypass in GnuTLS v3.8.13 allows attackers to circumvent the Common Name fallback mechanism and eavesdrop on communications via a crafted certificate.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-88648
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.5.
- Package/version after: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.6.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: Incomplete X.509 implementation in GnuTLS v3.8.13 allows attackers controlling a subordinate Certificate Authority to bypass cross-domain PKI restrictions and issue unauthorized certificates.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-89092
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/glibc@2.39-0ubuntu8.7.
- Package/version after: pkg:deb/ubuntu/glibc@2.39-0ubuntu8.9.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: The nscd service in the GNU C Library 2.3.4 onwards may crash due to a stack overflow when a malicious DNS server returns too large a response for a DNS query, resulting in degraded DNS resolution for the system. Exploitation of this bug needs a system that has nscd enabled and using an untrusted DNS server for name resolution, with the compromised DNS server being capable of processing records large enough to result in a stack overflow in an nscd thread stack. During experimentation, bind 9 was unable to handle large records, but that could change in future or with a different name server. In typical installations, nscd is executed in an isolated context as its own user without a shell, due to which any compromise of that service is isolated. There is a remote possibility of nscd cache corruption if an attacker manages to get the stack pointer into a desired point in the heap, potential
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-95184
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.5.
- Package/version after: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.6.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: Improper certificate validation in gnutls v3.8.13 causes the application to reject legitimate certificates for valid users, leading to a Denial of Service (DoS).
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-95209
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.5.
- Package/version after: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.6.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: An issue in gnutls v3.8.13 causes legitimate CA certificates to be rejected, leading to a Denial of Service (DoS).
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-95210
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.5.
- Package/version after: pkg:deb/ubuntu/gnutls28@3.8.3-1.1ubuntu3.6.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: Improper certificate validation in gnutls v3.8.13 causes the application to accept certificates containing invalid extensions.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-41257
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Package/version after: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: jq is a command-line JSON processor. In 1.8.1 and earlier, the jq bytecode VM's data stack tracks its allocation size in a signed int. When the stack grows beyond ≈1 GiB (via deeply nested generator forks), the doubling arithmetic overflows. The wrapped value is passed to realloc and then used for a memmove with attacker-influenced offsets.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-43896
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Package/version after: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: jq is a command-line JSON processor. In 1.8.1 and earlier, unbounded recursion in jv_object_merge_recursive() allows a crafted jq program to crash the process with a segfault. The function is reachable through the * operator when both operands are objects.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-44777
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Package/version after: pkg:deb/ubuntu/jq@1.7.1-3ubuntu0.24.04.2.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: jq is a command-line JSON processor. In 1.8.2rc1 and earlier, the ordinary module loader recurses without cycle detection when two otherwise valid modules include each other.
- Exposure: OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-89156
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Package/version after: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: PCRE2 before 10.48 has a pcre2_match out-of-bounds read after a JIT fallback when an attacker can provide invalid UTF data.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-89158
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Package/version after: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: PCRE2 before 10.48, on 32-bit platforms, has a pcre2_compile_32 integer overflow and resultant out-of-bounds write.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-89160
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Package/version after: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: PCRE2 before 10.48 has a pcre2_match out-of-bounds read during the PCRE2_MATCH_INVALID_UTF matching of an invalid UTF subject.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-89157
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Package/version after: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: PCRE2 before 10.48, on 32-bit platforms, has a pcre2_pattern_convert out-of-bounds write when an attacker can provide a large pattern.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

### CVE-2026-89161
- Severity before → after: MEDIUM → MEDIUM.
- Package/version before: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Package/version after: pkg:deb/ubuntu/pcre2@10.42-4ubuntu2.1.
- Published fix before / after: not fixed / not fixed.
- Origin: Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.
- Advisory context: In PCRE2 before 10.48, pcre2_jit_match mishandles a previously copied subject being passed in as a context. An incorrect free operation can occur.
- Exposure: Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.
- Decision: Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding. RESIDUAL: no production acceptance/exemption. Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.

## Residual release decision

CVE-2026-85091 remains HIGH in both Node Debian13 images (zlib OS package, no fixed Debian13 version reported). This is an explicit unresolved release risk, NOT an accepted exception. The Ubuntu package in Mongo is patched at its signed distro boundary. Lower findings remain listed individually; review is required before production. Do not compare an image scan to npm audit as if they cover the same dependency graph.
