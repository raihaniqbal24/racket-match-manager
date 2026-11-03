# Deployment

The app is served as static files by Caddy on the VPS (Debian 13) at
`https://racket-match-manager.raihaniqbal24.com`.

Every push to `master` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
it installs, tests, builds, and rsyncs `dist/` to `/var/www/racket-match-manager` on the VPS.
Caddy picks up the new files immediately; no restart needed.

The steps below are a one-time setup.

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

## 3. SSH key for GitHub Actions

On your PC, create a key used only for deploys (no passphrase, so Actions can use it).
Run the PC-side commands in Git Bash: Windows PowerShell doesn't expand `~` or pass `-N ""` the same way.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/racket_deploy -C "github-actions-racket-deploy" -N ""
```

Install the public key for the `deploy` user on the VPS. Print it on your PC:

```bash
cat ~/.ssh/racket_deploy.pub
```

then on the VPS, paste it in place of `<public key>`:

```bash
sudo mkdir -p /home/deploy/.ssh
echo "<public key>" | sudo tee -a /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Test from your PC (use `-p <port>` if SSH isn't on 22):

```bash
ssh -i ~/.ssh/racket_deploy deploy@<VPS IP> "echo ok"
```

## 4. Caddy site block (on the VPS)

Append to `/etc/caddy/Caddyfile`, next to the portfolio's block:

```caddy
racket-match-manager.raihaniqbal24.com {
	root * /var/www/racket-match-manager
	encode zstd gzip
	file_server

	# Vite fingerprints asset filenames, so they can be cached forever.
	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"
	# Always revalidate index.html so new deploys show up right away.
	@html path / /index.html
	header @html Cache-Control "no-cache"
}
```

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy requests the HTTPS certificate on its own once DNS points at the VPS.
If it doesn't come up, check `sudo journalctl -u caddy -n 50`.
Ports 80 and 443 must be open (they already are if the portfolio works).

## 5. GitHub secrets

In the repo, open **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS IP address (or its hostname) |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Full contents of `~/.ssh/racket_deploy` (the private key, including the `BEGIN`/`END` lines) |
| `VPS_KNOWN_HOSTS` | Output of `ssh-keyscan -p <port> <VPS IP>` run on your PC |
| `VPS_PORT` | SSH port; optional, defaults to 22 |

## 6. First deploy

Push to `master`, or run the workflow by hand from the **Actions** tab (**Deploy → Run workflow**).
When it's green, open https://racket-match-manager.raihaniqbal24.com.
