# Deployment

The app is served as static files by Caddy on the VPS (Debian 13) at
`https://racket-match-manager.raihaniqbal24.com`.

Every push to `master` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
it installs, tests, builds, checks that the deploy key is locked down, and rsyncs `dist/` to
`/var/www/racket-match-manager` on the VPS. Caddy picks up the new files immediately; no restart needed.

- **Already deployed before the security hardening?** Follow
  [Upgrading an existing deployment](#upgrading-an-existing-deployment) first. The new workflow
  refuses to deploy until the server side is updated.
- **Setting up from scratch?** Follow steps 1–6.

## 1. DNS (at the domain registrar)

Add a record for the subdomain pointing at the VPS:

| Type | Name / Host | Value | TTL |
| --- | --- | --- | --- |
| A | `racket-match-manager` | VPS IPv4 address | default |
| AAAA | `racket-match-manager` | VPS IPv6 address (only if the VPS has one and the portfolio uses it) | default |

Check it resolves before continuing (Caddy needs it to issue the HTTPS certificate):

```bash
nslookup racket-match-manager.raihaniqbal24.com
```

## 2. Deploy user and folder (on the VPS)

A dedicated user that can only write to the site folder:

```bash
sudo apt update && sudo apt install -y rsync
id deploy || sudo adduser --disabled-password --gecos "" deploy   # reuses an existing deploy user
sudo mkdir -p /var/www/racket-match-manager
sudo chown deploy:deploy /var/www/racket-match-manager
```

## 3. SSH key for GitHub Actions, locked to rrsync

On your PC, create a key used only for this deploy (no passphrase, so Actions can use it).
Run the PC-side commands in Git Bash: Windows PowerShell doesn't expand `~` or pass `-N ""` the same way.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/racket_deploy -C "github-actions-racket-deploy" -N ""
cat ~/.ssh/racket_deploy.pub
```

On the VPS, the key is installed **with a forced command**: it can only run `rrsync` (shipped with
the `rsync` package) into the site folder, never a shell. If the GitHub secret ever leaks, that is
all an attacker gets. Check `rrsync` is there:

```bash
command -v rrsync    # expect /usr/bin/rrsync
```

Then add the key, pasting the whole `ssh-ed25519 AAAA... github-actions-racket-deploy` line in place of `<public key>`:

```bash
sudo mkdir -p /home/deploy/.ssh
echo 'command="/usr/bin/rrsync /var/www/racket-match-manager",restrict <public key>' | sudo tee -a /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Test from your PC (add `-p <port>` / `-e "ssh -p <port> ..."` if SSH isn't on 22):

```bash
# Must FAIL now (rrsync rejects anything that isn't rsync):
ssh -i ~/.ssh/racket_deploy deploy@<VPS IP> "echo ok"
# Must succeed; "/" means /var/www/racket-match-manager through rrsync:
npm run build && rsync -az --dry-run --itemize-changes -e "ssh -i ~/.ssh/racket_deploy" dist/ deploy@<VPS IP>:/
```

## 4. Caddy site block (on the VPS)

Append to `/etc/caddy/Caddyfile`, next to the portfolio's block:

```caddy
racket-match-manager.raihaniqbal24.com {
	root * /var/www/racket-match-manager
	encode zstd gzip
	file_server

	header {
		# Browsers only ever use HTTPS for this host (1 year).
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		# Only this site's own files may run; no framing (clickjacking), no plugins, no form posts.
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
		X-Frame-Options "DENY"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
		Cross-Origin-Opener-Policy "same-origin"
		-Server
	}

	# Vite fingerprints asset filenames, so they can be cached forever.
	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"
	# Always revalidate the unhashed files so new deploys show up right away.
	@html path / /index.html /theme-init.js
	header @html Cache-Control "no-cache"
}
```

`style-src 'unsafe-inline'` is there because Vue sets a few inline `style` attributes (bar widths,
dropdown position); scripts stay strict. The dark-theme snippet lives in `public/theme-init.js`
rather than inline in `index.html` for the same reason.

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy requests the HTTPS certificate on its own once DNS points at the VPS.
If it doesn't come up, check `sudo journalctl -u caddy -n 50`.
Ports 80 and 443 must be open (they already are if the portfolio works).

Check the headers from your PC:

```bash
curl -sI https://racket-match-manager.raihaniqbal24.com/ | grep -iE "strict-transport|content-security|x-frame|x-content|referrer|permissions|server"
```

Then open the site with the browser dev tools console open: there should be no
"Refused to ... Content Security Policy" errors, and the dark theme should still stick on reload.

## 5. GitHub secrets and environment

The workflow runs in a GitHub **environment** called `production`, so its secrets can be limited to `master`.

1. **Settings → Environments → New environment**, name it `production`.
   (It is also created automatically on the first run, but without any rules.)
2. In it, under **Deployment branches and tags**, choose **Selected branches and tags** and add `master`.
   Optionally tick **Required reviewers** and add yourself, if you want to approve each deploy by hand.
3. Under **Environment secrets → Add environment secret**, add:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS IP address (or its hostname) |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Full contents of `~/.ssh/racket_deploy` (the private key, including the `BEGIN`/`END` lines) |
| `VPS_KNOWN_HOSTS` | Output of `ssh-keyscan -p <port> <VPS IP>` run on your PC |
| `VPS_PORT` | SSH port; optional, defaults to 22 |

Check `VPS_KNOWN_HOSTS` against the server itself rather than trusting the network:
on the VPS, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` should print the same fingerprint as
`ssh-keyscan <VPS IP> 2>/dev/null | ssh-keygen -lf -` on your PC.

## 6. First deploy

Push to `master`, or run the workflow by hand from the **Actions** tab (**Deploy → Run workflow**).
When it's green, open https://racket-match-manager.raihaniqbal24.com.

If the **Check the deploy key is restricted to rrsync** step fails, the key on the VPS isn't wrapped
in `command="/usr/bin/rrsync ..."` yet; redo step 3. This check is deliberate: the workflow uploads
to `/`, which is only the site folder when rrsync is in front of it.

---

## Upgrading an existing deployment

For a VPS and repo set up with the original version of this guide. Do these **in order and before
pushing the hardened workflow**. If you push first, the deploy just fails at the key check; nothing
on the server is touched.

1. **Lock the deploy key (VPS).** The file belongs to `deploy` and its folder is mode 700, so your
   own login gets "Permission denied": every command needs `sudo` (and `cd /home/deploy/.ssh` won't
   work even with sudo, so use full paths). Logged in as your usual admin user:

   ```bash
   command -v rrsync                                    # expect /usr/bin/rrsync
   sudo cp -a /home/deploy/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys.bak
   sudo sed -i '/github-actions-racket-deploy/{/^command=/!s|^|command="/usr/bin/rrsync /var/www/racket-match-manager",restrict |}' /home/deploy/.ssh/authorized_keys
   sudo cat /home/deploy/.ssh/authorized_keys
   ```

   The racket key's line should now read as below; any other keys (for example the portfolio's) are unchanged:

   ```
   command="/usr/bin/rrsync /var/www/racket-match-manager",restrict ssh-ed25519 AAAA... github-actions-racket-deploy
   ```

   Run the two tests at the end of step 3. If something's off, restore with
   `sudo cp -a /home/deploy/.ssh/authorized_keys.bak /home/deploy/.ssh/authorized_keys`.
2. **Add the security headers (VPS).** Replace the `racket-match-manager.raihaniqbal24.com { ... }`
   block in `/etc/caddy/Caddyfile` with the one in step 4, then validate, reload, and run the `curl -sI` check.
3. **Move the secrets into an environment (GitHub).** Do step 5: create `production`, limit it to
   `master`, and add the five secrets there. Then delete the old copies under
   **Settings → Secrets and variables → Actions → Repository secrets**. (The workflow works with
   either, but repository secrets are available to every workflow and branch.)
4. **Tighten the GitHub settings** in [GitHub repository and account](#github-repository-and-account).
5. **Push** (or **Actions → Deploy → Run workflow**) and confirm the run is green and the site still loads.

## Server hardening checklist (VPS)

From outside, only ports 22, 80 and 443 answer, and SSH accepts keys only. These keep it that way;
they cover the portfolio too, since it shares the box.

```bash
# Security updates installed automatically
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades      # answer Yes

# SSH: keys only, no root login. Expect "permitrootlogin no" and "passwordauthentication no"
sudo sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) '
```

If `sshd -T` shows anything else, create `/etc/ssh/sshd_config.d/10-hardening.conf` with:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

and run `sudo sshd -t && sudo systemctl reload ssh`. Keep your current SSH session open and test a
new login in a second terminal before closing it.

Firewall, if the VPS provider's own firewall isn't already doing this. **Allow SSH before enabling**,
using your real SSH port, or you lock yourself out:

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw allow 22/tcp          # your SSH port
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp         # HTTP/3, which Caddy advertises
sudo ufw enable
sudo ufw status verbose
```

Optional: `sudo apt install -y fail2ban` (its default `sshd` jail is enough) to cut down brute-force noise in the logs.

## GitHub repository and account

The repository is public and pushing to `master` deploys, so whoever can push to `master` controls the site.

- **Account:** turn on two-factor authentication (**Settings → Password and authentication**), preferably with a passkey or an authenticator app.
- **Settings → Actions → General:**
  - *Actions permissions*: **Allow raihaniqbal24, and select non-raihaniqbal24, actions and reusable workflows**, then tick **Allow actions created by GitHub** (the workflow only uses `actions/*`).
  - *Workflow permissions*: **Read repository contents and packages permissions**, and leave *Allow GitHub Actions to create and approve pull requests* unticked.
  - *Fork pull request workflows from outside collaborators*: **Require approval for all external contributors**.
- **Settings → Rules → Rulesets → New branch ruleset** targeting `master`: tick **Restrict deletions** and **Block force pushes**.
  As the only developer you can skip *Require a pull request*; add it once others contribute.
- **Settings → Advanced Security** (or **Code security**): enable **Dependabot alerts**, **Dependabot security updates**,
  **Secret scanning** and **Push protection**. [`.github/dependabot.yml`](.github/dependabot.yml) also opens weekly PRs that
  keep the SHA-pinned actions and npm packages current. Merging one deploys, after the tests pass.
- **Rotating the deploy key**, if you ever suspect it leaked: generate a new one (step 3), replace the line in
  `authorized_keys`, update `VPS_SSH_KEY` in the `production` environment, and delete the old private key from your PC.
