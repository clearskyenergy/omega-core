# Go to market: LinkedIn and the developer campaign

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **draft for the founder, written 2026-09-27.** Companion to `docs/SALES-AGENT.md` (the growth board, outreach rules, CAN-SPAM, off-limits accounts) and `docs/VALUE-LADDER-PACKAGING.md` (the modules). Every price here is the public price list (`GET /api/offerings`, book `2026-10`); if the book changes, change this file. Nothing here is published by code; a person posts and sends.

## 0. The message

**Ditch the stack.** A developer runs one project through six to ten tools (grid data, GIS, a sizing sheet, CAD, an estimate, a pro forma, a data room, RFQs by email) and re-keys the numbers at every hand-off. ClearSky OMEGA is one record from the first look at a parcel to the day the project is funded: screen, design, size, price, finance, operate. One login, priced per workspace, from $500 a month, 14-day trial.

Links used everywhere below (change them here once, e.g. for a vanity redirect on the marketing site):

- `{site}` https://www.clearskyomega.com
- `{pricing}` https://silmarillion.clearskyomega.com/offerings
- `{trial}` https://silmarillion.clearskyomega.com/start
- `{demo}` https://www.clearskyomega.com/contact.html

## 1. The voice

- First line under 12 words, a claim or a number, strong enough to stop a scroll. Never "Excited to announce".
- One idea per post. Short lines. A point of view a developer would argue with or forward.
- Specific over clever: MW, MWh, feeders, NTP, COD, NFPA 855, the 8,760. The reader's world, in their words.
- End on a line that lands or a question worth answering. Link in the first comment. Three hashtags at most.
- Nothing invented: a number is from the product, the public price list, a cited source, or labelled as an example.

**News-driven posts.** Timely posts earn follows that calendar posts do not. Rules:

- A timely post replaces the calendar post only for news from the last 72 hours that developers are discussing: interconnection rules (FERC, an ISO queue reform), a state storage or solar program, a battery permit fight or moratorium, an equipment price or tariff shock, a large-load announcement straining a grid.
- Verify the facts at the primary source or two independent reports; the source goes in the first comment.
- Shape: the news in one line, the take (what it changes about how a developer picks and proves a site), then the one OMEGA capability that answers it, in the product's own words.
- Never gloat about a company's loss, never name a prospect in a negative story, never tag a company to pitch it.

**Every day, 10 minutes** (the founder or whoever runs the page):

- Comment on 3 posts from target accounts (docs/developer-targets.csv): add a fact or a question, never a pitch.
- Reply to every comment on the page's posts within the day.
- Invite 10–20 relevant connections to follow the page.

## 1a. IP guardrails for anything public

Sell the result, never the method. The pricing, scoring, dispatch and modelling logic runs on the server (CLAUDE.md, *IP protection*) precisely so it cannot be read; a screenshot must not undo that.

**Do**

- Show outputs: a finished layout, a one-line, a headroom answer, a result chart, a price-list page.
- Take every screenshot and video in the sandbox (the sample workspace with invented data) or from the published guides.
- Describe what a module does in the words of the public price list, and link to it.
- Say "beta", "limited trial" or "coming soon" wherever the product does.
- Run live demos in the sandbox, or inside a trial workspace after the prospect has accepted the terms at sign-in. Those terms forbid reverse engineering and using the platform to build a competing product.
- Keep deep technical diligence (how a model works, what data sits behind it) for a signed NDA.

**Never**

- Show inputs, formulas, weights or assumption tables: scoring, dispatch, value-stack math, cost bands, unit rates, eligibility rules. They run on the server so nobody can read them, so don't put them in a screenshot either.
- Show a real customer's workspace, project, address, bill or equipment list.
- Name or show the logo of a customer without their written permission. Accounts under a signed agreement (the off-limits list in docs/SALES-AGENT.md §5) and anyone mid-negotiation are never named.
- Name data vendors, financing partners, the architecture, the database, internal tools or internal codenames.
- Claim what does not ship. The AHJ portal, the procurement marketplace, aggregators and offtakers are coming soon. Site Finder covers northern Illinois (ComEd) only. The Permitting Matrix is beta and verified jurisdiction by jurisdiction. Compute is in limited trial.
- Invent numbers: no hours saved, customer counts or savings unless they come from the product, the price list or a clearly labelled example.

## 2. Before launch

1. **Fix the website contact before sending anyone there.** The footer on www.clearskyomega.com still lists an info@ address on the retired legacy domain, and "Request a demo" should reach a clearsky-usa.com inbox somebody reads. The site also lists an AHJ Approval Portal, which the product marks coming soon. Bring the site in line with what ships.
2. **Decide whether prospects can pay on day one.** Card payment at signup is built but switched off in production, so today a signup waits for ClearSky approval, then runs a 14-day trial, then gets an invoice. Turning it on is the release checklist in docs/PACKAGING-RELEASE-CHECKLIST.md.
3. **Approve signups the same day.** The growth board (GET /api/growth) flags a signup waiting a day or more. A campaign that drives signups needs someone approving them daily.
4. **Pick the posting channel.** There is no LinkedIn connector in this session. Connect a scheduler that posts to LinkedIn company pages (Typefully or Metricool are in the connector directory; check that it supports company pages) and a daily routine can queue each post for approval. Without one, the routine can put each day's post in Gmail drafts to paste by hand.
5. **Pick the sender and the postal address.** Cold email needs a monitored clearsky-usa.com mailbox (docs/SALES-AGENT.md §10, decision 1) and a real postal address in every message. Never send cold email from a personal gmail.com address.
6. **Confirm the page facts.** Legal entity, headquarters (the website footer says Clinton, Iowa), company size, logo and banner.

## 3. The company page

| Field | Value |
|---|---|
| Name | ClearSky OMEGA |
| Tagline (111/120) | One platform from parcel to funded project. Screen, design, size, price and finance energy sites on one record. |
| Website | https://www.clearskyomega.com |
| Industry | Software Development |
| Button | Sign up → https://silmarillion.clearskyomega.com/start |

**About** (1509/2,000 characters)

```text
Developers run one project through a stack of disconnected tools: a grid-data subscription, a GIS seat, a sizing spreadsheet, CAD, an estimating sheet, a pro forma, a data room and an inbox full of RFQs. Every hand-off is re-keyed, and by the time a lender opens the model the numbers no longer match the drawing.

ClearSky OMEGA replaces the stack with one record, from the first look at a parcel to the day the project is funded.

• Screen: substations, lines and hosting capacity around a site, with an interconnection pre-screen, before you option the land.
• Design: lay out battery storage, solar, EV charging, microgrids and compute campuses on live satellite. Guided builds place the equipment, route the conduit and check NFPA 855 separations as you draw.
• Size and model: battery sizing against the real load and tariff, an 8,760-hour dispatch, and a pro forma that reconciles to it.
• Draw and price: plot plans, one-lines and permit sheets from the same model; an estimate and bill of materials that follow the design; requests for quote to the vendors on the BOM.
• Finance: investment analysis and a financing application built from the numbers already on the record.
• Operate: O&M, SLAs, field service and owner reporting once the asset is built.

Built for developers, EPCs, installers and equipment makers. It runs in any browser with nothing to install. Pricing is per workspace, not per seat, and starts at $500 a month. Every new company gets a 14-day trial.

Start at clearskyomega.com.
```

**Specialties** (18/20): Battery energy storage (BESS), Solar + storage, EV charging infrastructure, Microgrids, Data center power, Interconnection screening, Hosting capacity, Site selection, Energy project development software, Storage sizing, Value stack modeling, Pro forma modeling, Plan sets and one-line diagrams, Bill of materials and RFQ, Project finance, NFPA 855, O&M and asset management, White-label energy software

## 4. The 30-day calendar

Day 1 is a Monday. One post a day; weekend posts are light. The link goes in the first comment, not the post. Up to three hashtags. The founder reshares weekday posts from their own profile with a line of their own.

### Day 1 (Mon) · Launch: ditch the stack

*Ditch the stack · Image.* Visual: The card. No other company's name or logo on anything. Graphic: `day01.png` (stack).

```text
Eight tools. Three versions of the same number. One lender who notices.

That's how most battery projects reach financing: a grid-data subscription, a GIS seat, a sizing spreadsheet, CAD, an estimating sheet, a pro forma, a data room and an inbox full of RFQs.

Every hand-off gets re-keyed. Every re-key is a chance for the drawing and the model to disagree.

ClearSky OMEGA is one record from the first look at a parcel to the day the project is funded. Screen it, design it, size it, price it, finance it, run it.

Ditch the stack.

#EnergyStorage #BESS #RenewableEnergy
```

First comment: What's included, and the public price list: https://silmarillion.clearskyomega.com/offerings

### Day 2 (Tue) · Stop optioning land the grid cannot serve

*Screen · Image.* Visual: The card. Optional second image: a sandbox Grid Atlas screenshot with the coordinates cropped out. Graphic: `day02.png` (statement).

```text
Stop optioning land the grid can't serve.

It's the most expensive mistake in development, and it usually happens before anyone has looked at a substation.

In OMEGA the grid is the first layer you see around a parcel: substations and lines, hosting capacity where the utility publishes it, and an interconnection pre-screen against the fast-track screens.

"Can this site take 5 MW?" gets asked on day one, before the study deposit.

That's Grid Atlas. With Lite underneath, it starts at $750 a month.

#Interconnection #EnergyStorage #SolarDevelopment
```

First comment: Price list: https://silmarillion.clearskyomega.com/offerings

### Day 3 (Wed) · The fire marshal and the layout

*Design · Video.* Visual: Best: a 30–45 s sandbox recording (address, BESS Build, the layout drawing itself, the separation check). Without a recording, post the card. Graphic: `day03.png` (statement).

```text
The best-looking battery layout is worthless if the fire marshal kills it.

OMEGA's guided BESS build places the pads, the PCS and the transformer, draws the fence, and routes the conduit and trench home runs. Separations are checked against NFPA 855 and IFC 1207 while you draw.

The layout you show the landowner on Tuesday is one your engineer can still build on Friday.

#BESS #NFPA855 #EnergyStorage
```

First comment: Try it on your own sites for 14 days: https://silmarillion.clearskyomega.com/start

### Day 4 (Thu) · Sized on one hour of the year

*Size & model · Image.* Visual: The card. Optional: a sandbox value-stack result chart (results only, never the inputs or assumptions). Graphic: `day04.png` (statement).

```text
If your battery was sized to the peak, it was sized on one hour of the year.

That's what a peak-shaving estimate is: the worst hour of the month, multiplied out. A guess with a spreadsheet around it.

OMEGA sizes storage against the site's real load and real tariff, then runs the system through all 8,760 hours: demand charges, time-of-use, capacity and the programs the site can enroll in. The pro forma reads from that dispatch.

When the lender asks where a number came from, the answer is an hour of the year. Not a cell.

#EnergyStorage #ValueStack #BESS
```

First comment: Storage Sizing & Revenue is one module on the public price list: https://silmarillion.clearskyomega.com/offerings

### Day 5 (Fri) · No "contact sales for pricing"

*Offer · Image.* Visual: The card. Graphic: `day05.png` (list).

```text
No "contact sales for pricing." Here's ours.

• Lite, $500 a month: design sites on live satellite, guided builds, blueprints and customer proposals.
• Add a module for each thing you do, from $250: Grid Atlas, Storage Sizing & Revenue, Plan Sets & CAD, Investor & Finance and more.
• Per workspace, not per seat. Lite includes 3 builders and 10 viewers.
• Pay for the year and you pay for 10 months.

Plans carry an annual service fee; it's on the list too. Every new company gets a 14-day trial on its own sites.

#EnergySoftware #CleanEnergy
```

First comment: The full list: https://silmarillion.clearskyomega.com/offerings · Start a trial: https://silmarillion.clearskyomega.com/start

### Day 6 (Sat) · Poll: how many tools?

*Conversation · Poll.* Visual: LinkedIn poll, one week. Options: 1–3 · 4–6 · 7–9 · 10 or more

```text
Developers: how many software tools touch one of your projects before notice to proceed?

Count the subscriptions, the spreadsheets and the consultants' files.
```

### Day 7 (Sun) · Where do the numbers stop agreeing?

*Conversation · Image.* Visual: The card. Graphic: `day07.png` (statement).

```text
Where do your numbers stop agreeing?

For most teams it's one hand-off. The layout changes and the estimate doesn't. Or the pro forma is two revisions behind the sizing.

Which hand-off breaks your numbers most often? Tell us in the comments.
```

### Day 8 (Mon) · The lender believes neither

*Finance · Image.* Visual: The card. Optional: the sandbox investment analysis summary (outputs only). Graphic: `day08.png` (statement).

```text
If your site plan and your pro forma disagree, your lender believes neither.

In OMEGA the investment analysis reads the same record as the layout, the sizing and the estimate. Change the battery and the model follows.

When you're ready, apply for financing or put the project in front of capital from the project itself, with the evidence already attached. Nobody rebuilds the model for the data room.

That's Investor & Finance, $500 a month on top of Lite.

#ProjectFinance #EnergyStorage #CleanEnergyFinance
```

First comment: Price list: https://silmarillion.clearskyomega.com/offerings

### Day 9 (Tue) · A hosting capacity map is a filter

*Teach · Image.* Visual: The card. Graphic: `day09.png` (compare).

```text
A hosting capacity map is a filter. Not an answer.

It tells you roughly how much new generation a feeder section could take on the day the utility ran the study.

It doesn't tell you what's already in the queue ahead of you, how old the study is, or what the upgrade costs if you're over the line.

The answer comes from a study. The filter decides which sites deserve one.

We put the filter next to the parcel, so the sites that fail it never get optioned.

#Interconnection #HostingCapacity #SolarDevelopment
```

### Day 10 (Wed) · Move the battery 40 feet

*Draw · Video.* Visual: Best: a 15–20 s sandbox recording (drag the compartment, the trench re-routes, the count changes). Without one, post the card. Graphic: `day10.png` (list).

```text
Move the battery 40 feet. Now update everything that depended on where it was.

The trench. The conduit schedule. The quantities. The estimate.

In OMEGA the plot plan, the one-line and the takeoff read the same model. Move a compartment and the trench re-routes, the schedule re-counts and the estimate follows.

Plan Sets & CAD also exports for your CAD team (in beta).

#BESS #Engineering #EPC
```

First comment: Try it on your own site: https://silmarillion.clearskyomega.com/start

### Day 11 (Thu) · Five quotes, five call lists

*Price & RFQ · Image.* Visual: The card. Graphic: `day11.png` (statement).

```text
Ask five vendors for a quote and you're on five call lists. For good.

The bill of materials in OMEGA writes itself as equipment lands on the drawing. When you're ready, send a request for quote to the vendors on it.

Each vendor sees only their own lines. Your company stays anonymous until you accept a quote.

Cleaner comparisons, fewer emails, and nobody calls before you're ready.

#Procurement #EnergyStorage #BESS
```

First comment: Estimate, BOM & Procurement is on the price list: https://silmarillion.clearskyomega.com/offerings

### Day 12 (Fri) · A developer's week, one record

*Ditch the stack · Carousel.* Visual: Upload the PDF as a document post (Add a document), titled "A developer's week". Graphic: `day12.png` (carousel).

```text
A developer's week, on one record.

Mon: screen five parcels against the grid.
Tue: lay out the best two on satellite.
Wed: size the storage against the tariff.
Thu: pull the one-line, the BOM and the estimate.
Fri: run the investment analysis and send it to capital.

Same project, same numbers, one login. Swipe through →

#ProjectDevelopment #EnergyStorage #SolarDevelopment
```

First comment: 14 days on your own sites: https://silmarillion.clearskyomega.com/start

### Day 13 (Sat) · NFPA 855 in one paragraph

*Teach · Image.* Visual: The card. Graphic: `day13.png` (statement).

```text
NFPA 855 in one paragraph, for people who draw site plans.

It sets the rules for installing stationary battery systems: how much energy each group can hold, how far apart the groups sit, how far they sit from buildings and other exposures, and what large-scale fire testing lets you change. Your AHJ adopts it through its fire code, sometimes with local amendments.

If the layout you show a landowner ignores it, the site you sold them shrinks at permitting.

Always confirm with your AHJ and your engineer.

#NFPA855 #BESS #FireSafety
```

### Day 14 (Sun) · Why we built it (founder)

*Conversation · Text.* Visual: A real photo of the founder on a site, if there is one. Post from the founder's own profile; the company page reshares.

```text
Why we built OMEGA.

We didn't start as a software company. We developed and built energy projects: storage, EV charging, microgrids, compute campuses.

Every project ran through the same pile of tools, and we spent more time re-keying numbers between them than making decisions. So we built the working book we wanted: one record from the parcel to the funded project.

Now any developer can work from it. If you want to see it on one of your own sites, send me an address.

[Founder: rewrite this in your own words before it goes out.]
```

### Day 15 (Mon) · What one platform replaces

*Ditch the stack · Image.* Visual: The card. Graphic: `day15.png` (list).

```text
Ditch the stack: what one platform replaces.

Grid and hosting-capacity data → Grid Atlas
Site-screening consultant or GIS time → Site Intelligence
Battery-sizing and revenue spreadsheets → Storage Sizing & Revenue
CAD seat and outsourced drafting → Plan Sets & CAD
Estimating sheets and RFQs by email → Estimate, BOM & Procurement
The analyst-built pro forma → Investor & Finance
An asset-management platform → Operations

One platform, priced per module, on one record.

#EnergyStorage #SolarDevelopment #CleanEnergy
```

First comment: Every module and its price: https://silmarillion.clearskyomega.com/offerings

### Day 16 (Tue) · 50 parcels, three site visits

*Screen · Image.* Visual: The card. Optional: the sandbox parcel screening register with sample sites. Graphic: `day16.png` (statement).

```text
50 parcels. Which three deserve a site visit?

Drop a folder of site KMZs into OMEGA's parcel screening register and get them ranked. Terrain from USGS 3DEP LiDAR, buildable area after exclusions, and network proximity for compute sites, with the grid picture alongside.

Spend the drive time on the sites that pass.

That's Site Intelligence, $500 a month on top of Lite.

#SiteSelection #SolarDevelopment #CommunitySolar
```

First comment: Price list: https://silmarillion.clearskyomega.com/offerings

### Day 17 (Wed) · One person designs, twenty look

*Offer · Image.* Visual: The card. Graphic: `day17.png` (statement).

```text
One person designs. Twenty people look.

Most software charges for every one of them.

OMEGA is priced per workspace. Lite includes 3 builders and 10 viewers, so the land rep, the finance lead and the partner EPC can open the same record without another license.

#EnergySoftware #ProjectDevelopment
```

First comment: How pricing works: https://silmarillion.clearskyomega.com/offerings

### Day 18 (Thu) · Compute: shopping for interconnection

*Screen · Image.* Visual: The card. Optional: a sandbox compute campus layout. Graphic: `day18.png` (statement).

```text
Data-center developers aren't shopping for acreage. They're shopping for interconnection.

OMEGA lays out a compute campus against what the grid will carry, sizes the generation and storage that closes the gap, and tells you whether the site can hold the load before anyone signs anything.

Compute & Data Center is in limited trial. If you're siting load, ask us for access.

#DataCenters #Interconnection #PoweredLand
```

First comment: Ask for access: https://www.clearskyomega.com/contact.html

### Day 19 (Fri) · 14 days on your own sites

*Offer · Image.* Visual: The card. Graphic: `day19.png` (statement).

```text
Try it on your own sites for 14 days.

Sign up with your work email, tell us what you build, and we open a workspace for your company. Bring an address and a utility bill and we'll build the first site with you.

One trial per company. Link in the comments.

#EnergyStorage #SolarDevelopment #EVCharging
```

First comment: Start here: https://silmarillion.clearskyomega.com/start

### Day 20 (Sat) · Poll: what slows your pipeline?

*Conversation · Poll.* Visual: LinkedIn poll, one week. Options: Interconnection · Land and site control · Financing · Equipment and pricing

```text
What slows your pipeline down most right now?
```

### Day 21 (Sun) · Why hourly beats peak

*Teach · Image.* Visual: The card. Graphic: `day21.png` (compare).

```text
Why hourly beats peak.

A peak-shaving estimate asks one question: how much can the battery take off the worst hour of the month?

An 8,760 asks it for every hour of the year, against the tariff, the programs and the battery's own limits: state of charge, cycles and round-trip losses. The two answers can be far apart, and lenders know it.

Model the year, not the peak.

#EnergyStorage #BESS #ValueStack
```

### Day 22 (Mon) · Fast-charging hubs

*Design · Image.* Visual: The card. Optional: a sandbox DCFC build. Graphic: `day22.png` (statement).

```text
Building a fast-charging hub? Start with the service, not the chargers.

In OMEGA a DCFC build lays out the chargers, the switchgear and the transformer on the site, checks the load against what the grid can serve, and feeds a DCFC pro forma with utilization, IRR and payback on the same record.

Add storage to shave the demand charge and watch the model move.

#EVCharging #DCFC #EVInfrastructure
```

First comment: 14-day trial: https://silmarillion.clearskyomega.com/start

### Day 23 (Tue) · COD is day one of the asset

*Operate · Image.* Visual: The card. Graphic: `day23.png` (statement).

```text
COD is the start of the asset, not the end of the project.

OMEGA's Operations module keeps the same record after it's built: O&M, SLA and contract tracking, field service and dispatch, and owner reporting.

The drawing your team made in year zero is the one the technician opens in year eight.

#AssetManagement #EnergyStorage #OandM
```

First comment: Operations on the price list: https://silmarillion.clearskyomega.com/offerings

### Day 24 (Wed) · Address to proposal, timed

*Design · Video.* Visual: A one-take sandbox recording with a clock on screen: address, grid check, layout, sizing, proposal. Post the real time; never write a time before you record it. The card is the cover. Graphic: `day24.png` (statement).

```text
Address to proposal, timed.

We start the clock, type an address and build a battery site from nothing: grid check, layout, sizing, proposal. The clock stays on screen the whole time.

No cuts. Watch the time at the end.

#BESS #EnergyStorage #ProjectDevelopment
```

First comment: Do it on your own site: https://silmarillion.clearskyomega.com/start

### Day 25 (Thu) · A report ends; a record keeps working

*Ditch the stack · Image.* Visual: The card. Graphic: `day25.png` (statement).

```text
A consultant's report ends when the invoice does.

A record keeps working. Every site you screen, draw and model in OMEGA stays in your workspace, so the next project starts from the last one: your equipment, your layouts, your assumptions, your team's notes.

Ditch the stack. Keep the record.

#ProjectDevelopment #EnergyStorage
```

### Day 26 (Fri) · The developer setup

*Offer · Image.* Visual: The card. Graphic: `day26.png` (list).

```text
The setup most developers start with:

Lite + Grid Atlas + Storage Sizing & Revenue + Investor & Finance.

Screen the grid, design the site, size and model the storage, and take it to capital. On the Field plan that's $1,299 a month, with room for one more $250 module. Pay for the year and you pay for 10 months. Plans carry an annual service fee; it's on the public price list.

14-day trial for new companies. Link in the comments.

#EnergyStorage #SolarDevelopment #ProjectFinance
```

First comment: Price list: https://silmarillion.clearskyomega.com/offerings · Start a trial: https://silmarillion.clearskyomega.com/start

### Day 27 (Sat) · Cancel one subscription

*Conversation · Image.* Visual: The card. Graphic: `day27.png` (statement).

```text
If you could cancel one software subscription tomorrow and not miss it, which one would it be?
```

### Day 28 (Sun) · What a lender looks for

*Teach · Image.* Visual: The card. Graphic: `day28.png` (list).

```text
What a lender looks for in a storage pro forma.

1. Revenue that ties back to an hourly dispatch, not a single peak.
2. Degradation, and the warranty that covers it, year by year.
3. Augmentation: when capacity gets added back and what it costs.
4. Every assumption stated, with its source.
5. A layout and an estimate that match the model.

OMEGA keeps the dispatch, the degradation, warranty and augmentation model, the layout and the estimate on one record.

#ProjectFinance #EnergyStorage
```

### Day 29 (Mon) · Four weeks, one message

*Offer · Image.* Visual: The card, or reuse the day-1 card. Graphic: `day29.png` (statement).

```text
Four weeks, one message: ditch the stack.

Screen, design, size, price, finance and operate an energy project on one record, in a browser, priced per workspace.

If you've followed along and haven't tried it, this is the week. 14 days on your own sites, or 30 minutes where we build one of your sites live with you.

#EnergyStorage #SolarDevelopment #CleanEnergy
```

First comment: Trial: https://silmarillion.clearskyomega.com/start · Live walkthrough: https://www.clearskyomega.com/contact.html

### Day 30 (Tue) · Live build (event)

*Conversation · Image.* Visual: Create a LinkedIn Event or Live first; fill in the date and time in the text. The card is the cover. Graphic: `day30.png` (statement).

```text
Live build, [DATE] at [TIME].

Drop an address in the comments, a real site or a public one. We'll pick three and build them live: grid check, layout, sizing and a first pro forma, in 30 minutes.

Register below.

#EnergyStorage #BESS #ProjectDevelopment
```

First comment: [Event link]

## 5. The developer campaign

**Who**

| Segment | Lead with |
|---|---|
| C&I / behind-the-meter storage developers and energy-as-a-service | Grid Atlas, Storage Sizing & Revenue, Investor & Finance |
| Community solar + storage developers (IL, NY, NJ, MA, MD, MN, ME, CO) | Grid Atlas, Site Intelligence, Storage Sizing & Revenue |
| Independent front-of-meter BESS developers (ERCOT, CAISO, PJM, MISO, NYISO, ISO-NE) | Grid Atlas, Site Intelligence, Investor & Finance |
| EV fast-charging hub and fleet charging developers | Lite (DCFC build), Grid Atlas, Investor & Finance (DCFC pro forma) |
| Microgrid and data-center power / powered-land developers | Compute & Data Center (limited trial), Grid Atlas, Site Intelligence |

Small to mid-size (about 5–300 people), without a large in-house GIS, modelling and CAD department. Titles: Founder or CEO (under 30 people); VP or Director of Development; Head of Origination; Interconnection Manager; Development Manager; Project Finance lead.

**The offer.** A 20-minute live build of one of their sites from an address, then a 14-day trial on their own sites. The starting package is Lite + Grid Atlas + Storage Sizing & Revenue + Investor & Finance, which is the Field plan ($1,299 a month, room for one more $250 module; annual pays 10 of 12 months; plus the annual service fee on the price list).

**Reasons to write now** (one per message, specific and dated):

- A project announcement (MW, MWh, market, date)
- A new interconnection queue entry in a public ISO or utility queue
- A funding round, tax-equity close or new financing partner
- Entry into a new state or ISO
- A job post for GIS, interconnection or energy modelling (they are building the stack you replace)

**The sequence** (outreach rules: `docs/SALES-AGENT.md` §5; work addresses only, one thread per company, a real postal address and an opt-out in every email, stop on the first "no")

#### Day 1 · LinkedIn · Connection request (under 300 characters)

```text
Hi {First}, I work with developers on siting and early-stage modelling. Saw {hook}. Would be good to connect.
```

#### Day 1 · Email · Email 1

Subject: `{Company} and {market} sites`

```text
Hi {First},

Saw {hook}.

Most developers we talk to run a site through six or more tools before it reaches a lender: grid data, GIS, a sizing sheet, CAD, an estimate, a pro forma. ClearSky OMEGA does it on one record: grid headroom around the parcel, the layout on satellite, sizing against the tariff, the one-line and the BOM, and a pro forma that reconciles to an hourly dispatch.

Would a 20-minute session help, where we build one of your sites live from an address?

{Sender}
ClearSky OMEGA · {postal address}
Not the right person, or not interested? Reply "no" and I won't write again.
```

#### After they accept · LinkedIn · DM 1

```text
Thanks for connecting, {First}. We built ClearSky OMEGA so a development team can screen, design, size, price and finance a site in one place instead of six tools. If it would help, I can build one of your sites live in 20 minutes from an address. Open to it?
```

#### Day 4 · Email · Email 2 (reply in the same thread)

Subject: `Re: {Company} and {market} sites`

```text
{First}, one thing I should have said: pricing is per workspace, not per seat. Your whole development team works from the same record, from $500 a month, and the setup most developers start with is on our public price list: https://silmarillion.clearskyomega.com/offerings

I can open a 14-day trial for your company so you can run your own sites. Worth it?

{Sender}
ClearSky OMEGA · {postal address}
Reply "no" and I won't write again.
```

#### Day 8 · LinkedIn · DM 2

```text
{First}, we posted a short clip of a battery site going from an address to a one-line and a pro forma. Thought of your {market} work: {post link}
```

#### Day 11 · Email · Email 3 (last)

Subject: `Re: {Company} and {market} sites`

```text
Last note from me, {First}.

If screening and modelling sit with a consultant or a spreadsheet today, OMEGA gives your team a first answer on day one: is there grid room, what fits on the parcel, and what it could earn. That's before anyone pays for a study.

If the timing's wrong, no problem. The trial is here whenever it's useful: https://silmarillion.clearskyomega.com/start

{Sender}
ClearSky OMEGA · {postal address}
```

**Cadence**

| | |
|---|---|
| Accounts per week | 20 new developer accounts, one named person each |
| LinkedIn | 5 connection requests a day from the founder's own profile, with a note; comment on their posts before you pitch |
| Email | The three-email sequence above, from a monitored clearsky-usa.com mailbox, drafted in Gmail and sent by a person |
| Company page | One post a day from the calendar; the founder reshares each weekday post with a line of their own |
| Tracking | Company, person, source, hook, stage, next step and date on one sheet (later: the prospects board in docs/SALES-AGENT.md §5) |

**Measure**

| | |
|---|---|
| Weekly | Posts published, follower change, link clicks, accounts touched, replies, walkthroughs booked, trial requests |
| Monthly | Trials approved, trials that built a project, trials converted to paid, paid revenue added |
| Starting targets (adjust after week 2) | 5 conversations and 2 trial requests a week |

## 6. Target accounts

`docs/developer-targets.csv` (50 companies, public sources, company-level only; no personal contact data). Read the source before you write: a hook is only as good as its date. Check the growth board and the off-limits list before the first touch; a company that signs up leaves this list.

## 7. The daily run

One run each morning: news check, the post, its graphic, the guardrail check, delivered ready to paste (or queued in a connected scheduler for approval). The graphics come from `scripts/marketing/` (`build.py`, then `card.js`; fonts are embedded, no network). Prompt:

> Daily LinkedIn post for ClearSky OMEGA. Read CLAUDE.md and docs/GO-TO-MARKET.md (the guardrails, the voice and the news rules). 1) Today's calendar day: day 1 is [START DATE], one post a day. 2) Search the last 72 hours of energy-development news. If something clears the news rules, write a timely post in the voice instead of the calendar post, with its source for the first comment and a card spec in the same shape as content.py; otherwise take the calendar post and sharpen its first line if you can. 3) Check it against the guardrails and the list of what does not ship; say what you changed. 4) Render the graphic: python3 scripts/marketing/build.py <out>, then node scripts/marketing/card.js <out>/cards.json <out> <dayNN> (a timely post: a one-card JSON of your own). 5) Deliver it ready to paste: the graphic (and the PDF for a carousel), the post, the first comment and today's engagement list. With a scheduler connected, queue it there as a draft for approval instead. Never publish without the founder's approval. 6) Mondays: last week's numbers if the scheduler reports them, and what to do more of. After day 30, write the next week in the same pillars and voice and ask before using it.

## 8. Not done

- Nothing has been posted or sent. There is no LinkedIn connector in this session.
- The screen recordings (days 3, 10, 24) are described, not made; each has a card to post instead.
- The website contact, the pay-now switch and the sender mailbox (§2) are open.
- Prospects are a CSV, not the `prospects/` board `docs/SALES-AGENT.md` §5 designs.
