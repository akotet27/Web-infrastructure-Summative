# NeuroRef — Epilepsy Medication Reference

NeuroRef is a web application that helps people living with epilepsy, their caregivers, and students understand anti-epileptic medications. It pulls **official FDA drug label data** (indications, side effects, drug interactions, dosage, and warnings) from the [openFDA API](https://open.fda.gov/) and presents it in plain, readable sections — information that is otherwise buried in dense regulatory documents.

**Live demo (load balancer):** http://3.93.236.243/
**Demo video:** https://YOUR-VIDEO-LINK

## Why this app matters

Epilepsy treatment usually involves long-term medication, frequent drug changes, and a real risk of drug-to-drug interactions (many anti-epileptics induce or inhibit the liver enzymes that metabolize other drugs). Patients are routinely handed a new prescription with little accessible explanation. NeuroRef addresses that genuine need:

- **Explore medications** — search any drug (generic or brand name) and read what it treats, its documented side effects, interactions, dosage, and warnings, straight from the FDA label.
- **Check interactions** — enter two medications and see, side by side, what each drug's official label says about interactions.

> ⚠️ NeuroRef displays official label text for reference only. It is **not** medical advice and does not compute clinical interaction results. Always confirm anything about your medications with a doctor or pharmacist.

## Features

| Feature | Details |
|---|---|
| External API | openFDA Drug Label endpoint (`https://api.fda.gov/drug/label.json`) |
| Search | Free-text search by generic or brand name, plus one-click chips for 10 common anti-epileptics |
| Filter | Show only a chosen label section (e.g. just "Side effects") |
| Sort | Results by relevance, name A–Z, or Z–A |
| Compare | Two-drug side-by-side interaction comparison |
| Error handling | Distinct, human-readable messages for: empty input, drug not found (404), rate limiting (429), network failure, malformed responses, and unexpected HTTP errors |
| Caching | API responses cached in `localStorage` for 24 h — repeat searches are instant and don't consume rate limit |
| Accessibility | Skip link, ARIA live regions, keyboard operable, reduced-motion support |

## Project structure

```
├── index.html              # Single-page UI (two views: explorer + compare)
├── styles/main.css         # Standalone stylesheet, no framework
├── scripts/
│   ├── api.js              # openFDA fetching, caching, error types
│   ├── ui.js               # DOM rendering (cards, columns, states)
│   ├── app.js              # Event wiring: tabs, search, filter, sort, compare
│   └── config.example.js   # Template for the optional API key config
└── .gitignore              # Excludes scripts/config.js (real key)
```

## Running locally

The app is plain HTML/CSS/JS (ES modules), so it just needs any static file server — modules won't load from `file://`.

```bash
git clone https://github.com/akotet27/Web-infrastructure-Summative.git
cd Web-infrastructure-Summative

# (optional) add an openFDA API key — the app works without one
cp scripts/config.example.js scripts/config.js
# then paste your key into scripts/config.js

# serve it (pick whichever you have):
python -m http.server 8000
# or: npx serve .
```

Open http://localhost:8000 and search a medication (e.g. *levetiracetam*).

### API keys and security

openFDA allows **keyless** requests (shared limit of 240 requests/min per IP), so no secret is required to run or grade this app. This was a deliberate architecture choice: NeuroRef is a static frontend, and browser JavaScript cannot hold a secret safely — any key embedded in client-side code is visible to anyone who opens DevTools. Choosing a keyless API avoids that exposure entirely rather than working around it. An optional personal key raises the limit to 120,000 requests/day; it lives in `scripts/config.js`, which is **git-ignored** so it is never committed. Any key needed for grading is provided in the submission comments, per the assignment instructions — for this app, none is required.

## Deployment (Web01, Web02, Lb01)

This is a static site, so deployment is copying the HTML/CSS/JS files onto each web node and serving them with Nginx. HAProxy on the load balancer forwards traffic to both nodes in round-robin order.

**Servers used:**

| Node | IP |
|---|---|
| web-01 | `184.72.105.193` |
| web-02 | `52.23.236.50` |
| lb-01 | `3.93.236.243` |

### 1. Deploy the app to Web01 and Web02

Repeat the same steps on both web servers. Nginx is already installed on both nodes from the earlier load-balancer project in this course, so deployment only replaces the site content.

SSH into the server and clone the repo directly (or `git pull` if it's already cloned from a previous deploy):

```bash
ssh -i ~/.ssh/school ubuntu@184.72.105.193   # then repeat for 52.23.236.50

git clone https://github.com/akotet27/Web-infrastructure-Summative.git
# or, on a redeploy: cd Web-infrastructure-Summative && git pull

sudo rm -rf /var/www/html/*
sudo cp -r ~/Web-infrastructure-Summative/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html
```

Each web server's Nginx config already adds a custom `X-Served-By` response header (set up in an earlier project) so requests can be traced back to the server that handled them:

```nginx
add_header X-Served-By 7154-web-01 always;   # 7154-web-02 on the second server
```

Reload and confirm:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I http://localhost   # expect HTTP 200 + X-Served-By header
```

### 2. Configure the load balancer (Lb01)

HAProxy on `lb-01` was configured in an earlier project to round-robin between the two web servers:

```haproxy
frontend http_front
    bind *:80
    default_backend web_servers

backend web_servers
    balance roundrobin
    server 7154-web-01 184.72.105.193:80 check
    server 7154-web-02 52.23.236.50:80 check
```

`balance roundrobin` alternates requests between the two servers; `check` enables health checks so a dead server is automatically pulled out of rotation. No changes to this config were needed to deploy NeuroRef — the load balancer simply forwards to whichever content Nginx is currently serving.

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg   # validate config
sudo systemctl restart haproxy
```

### 3. Verify load balancing

From any machine, hit the load balancer repeatedly and watch the `X-Served-By` header alternate:

```bash
curl -sI http://3.93.236.243/ | grep -i x-served-by   # → 7154-web-01
curl -sI http://3.93.236.243/ | grep -i x-served-by   # → 7154-web-02
curl -sI http://3.93.236.243/ | grep -i x-served-by   # → 7154-web-01 ...
```

The same alternation is visible in the browser: open DevTools → Network tab → tick **Disable cache** → refresh → check the `x-served-by` response header on the document request. Refresh again and it flips to the other server.

Also verify end-to-end in a browser: open http://3.93.236.243/, run a search, and confirm data renders correctly through the load balancer. Stopping Nginx on one web server (`sudo systemctl stop nginx`) and refreshing confirms HAProxy fails over to the healthy server.

## Challenges and how I solved them

- **openFDA has no single canonical record per drug** — the same generic drug has many manufacturers' labels, each with slightly different fields. I handled this by requesting several results and normalizing them in `api.js` (`simplifyLabel`), skipping records with no usable name or sections. This means a search can return multiple cards for the same generic drug (e.g. several manufacturers of lamotrigine); this is intentional rather than a bug, since manufacturer labels occasionally differ in warnings or formulation details, and showing them separately preserves that information.
- **Label sections are enormous walls of regulatory text.** Dumping them raw made the UI unreadable. I render a ~900-character excerpt with a "Read full section" toggle so the data stays scannable but complete.
- **Rate limiting during development.** Repeatedly reloading while testing burned through the keyless per-minute limit. Adding a 24-hour `localStorage` cache fixed this and made repeat searches instant — it doubles as the performance-optimization bonus task.
- **ES modules refuse to load from `file://`**, which cost me some confusion early on; the fix is simply serving the folder with any static server (documented above).
- **A CSS specificity bug caused the loading spinner to appear on page load even before a search was made.** The `hidden` HTML attribute was being overridden by a later `display: flex` rule on `.state-loading`. Fixed with an explicit `[hidden] { display: none !important; }` rule so the `hidden` attribute always wins regardless of other display rules.

## Credits

- **Data & API:** [openFDA](https://open.fda.gov/) — Drug Label API by the U.S. Food & Drug Administration. [Endpoint documentation](https://open.fda.gov/apis/drug/label/) · [Authentication docs](https://open.fda.gov/apis/authentication/). openFDA data is provided in the public domain; note openFDA's own disclaimer that its data is not intended for clinical decision-making.
- **Fonts:** [Google Fonts](https://fonts.google.com/) — Roboto, Raleway, Poppins.
- **Design inspiration:** color palette adapted from the Medicio template (BootstrapMade); all CSS written from scratch.