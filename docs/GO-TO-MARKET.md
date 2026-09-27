# Go to market: LinkedIn and the developer campaign

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **draft for the founder, written 2026-09-27.** Companion to `docs/SALES-AGENT.md` (the growth board, outreach rules, CAN-SPAM, off-limits accounts) and `docs/VALUE-LADDER-PACKAGING.md` (the modules). No price appears in anything public: pricing is for the call (founder decision, 2026-09-27), and build.py refuses a dollar sign in a post, a card, a comment, an answer or an email. Nothing here is published by code; a person posts and sends.

## 0. The message

**Ditch the stack.** A developer runs one project through six to ten tools (grid data, GIS, a sizing sheet, CAD, an estimate, a pro forma, a data room, RFQs by email) and re-keys the numbers at every hand-off. ClearSky OMEGA is one record from the first look at a parcel to the day the project is funded: screen, design, size, price, finance, operate. One login, 14-day trial.

**Engagement first.** Seven game series, the same every week: Drop a Site (Mon), Build Tuesday, Guess & Spot (Wed), Count Your Stack (Thu), Speedrun Friday, Site Leaderboard (Sat), Field Notes (Sun). Each asks for one small thing in the comments. They show speed, scale and ease, never the method.

Links used everywhere below (change them here once, e.g. for a vanity redirect on the marketing site):

- `{site}` https://www.clearskyomega.com
- `{trial}` https://silmarillion.clearskyomega.com/start
- `{demo}` https://www.clearskyomega.com/contact.html

## 1. The voice

- Engagement first. Every post asks for one small thing: a comment, a guess, a vote, an address, a score.
- The same seven series every week (Drop a Site, Build Tuesday, Guess & Spot, Count Your Stack, Speedrun Friday, Site Leaderboard, Field Notes), so people know what is coming and come back.
- First line under 12 words, a claim, a number or a challenge, strong enough to stop a scroll. Never "Excited to announce".
- Show speed, scale and ease; never the method. A real timer from a real recording, a real count of sites, the result on screen.
- No prices, plans, discounts or links to the price list. Pricing is for the call.
- Specific over clever: MW, feeders, NTP, COD, NFPA 855, the 8,760. Short lines. Three hashtags at most.
- Nothing invented: a number is from the product, a recording, a cited source, or labelled illustrative.

**News-driven posts.** Timely posts earn follows that calendar posts do not. Rules:

- A timely post replaces the calendar post only for news from the last 72 hours that developers are discussing: interconnection rules (FERC, an ISO queue reform), a state storage or solar program, a battery permit fight or moratorium, an equipment price or tariff shock, a large-load announcement straining a grid.
- Verify the facts at the primary source or two independent reports; the source goes in the first comment.
- Shape: the news in one line, the take (what it changes about how a developer picks and proves a site), a question for the comments, then the one OMEGA capability that answers it.
- Never gloat about a company's loss, never name a prospect in a negative story, never tag a company to pitch it.
- Never move a series day (Drop a Site, Speedrun Friday) for news; post the news the next open day instead.

**Every day, 10 minutes** (the founder or whoever runs the page):

- Answer every Drop a Site entry within 24 hours: run it in Grid Atlas and reply with results only (nearest substations and lines, published hosting capacity). Paste the results to the daily run and it sends back a "Site screened" card per entry to reply with. Never explain how the screen works, and never name the entrant's site more precisely than they did.
- Reply to every comment on the day's post. A reply that asks a question back doubles the thread.
- Everyone who comments BUILD or guesses closest gets a direct message offering a live build of their site.
- Comment on 3 posts from target accounts (docs/developer-targets.csv): a fact or a question, never a pitch.
- Invite 10–20 relevant connections to follow the page.

## 1a. IP guardrails for anything public

Sell the result, never the method. The pricing, scoring, dispatch and modelling logic runs on the server (CLAUDE.md, *IP protection*) precisely so it cannot be read; a screenshot must not undo that.

**Do**

- Show outputs: a finished layout, a one-line, a headroom answer, a result chart, a price-list page.
- Take every screenshot and video in the sandbox (the sample workspace with invented data) or from the published guides.
- Show speed, scale and ease: a real timer from a real recording, a real count of sites, the finished layout or ranking on screen.
- Answer a Drop a Site entry with results only: distances, voltages, published hosting capacity.
- Say "beta", "limited trial" or "coming soon" wherever the product does.
- Run live demos in the sandbox, or inside a trial workspace after the prospect has accepted the terms at sign-in. Those terms forbid reverse engineering and using the platform to build a competing product.
- Keep deep technical diligence (how a model works, what data sits behind it) for a signed NDA.

**Never**

- Show inputs, formulas, weights or assumption tables: scoring, dispatch, value-stack math, cost bands, unit rates, eligibility rules. They run on the server so nobody can read them, so don't put them in a screenshot either.
- Show a real customer's workspace, project, address, bill or equipment list.
- Name or show the logo of a customer without their written permission. Accounts under a signed agreement (the off-limits list in docs/SALES-AGENT.md §5) and anyone mid-negotiation are never named.
- Name data vendors, financing partners, the architecture, the database, internal tools or internal codenames.
- Claim what does not ship. The AHJ portal, the procurement marketplace, aggregators and offtakers are coming soon. Site Finder covers northern Illinois (ComEd) only. The Permitting Matrix is beta and verified jurisdiction by jurisdiction. Compute is in limited trial.
- Invent numbers: no hours saved, times, customer counts or savings unless they come from the product, a recording or a clearly labelled example.
- Post a price, a plan, a discount, or a link to the price list or the signup page. Pricing is for the call (founder decision, 2026-09-27).
- Show how a ranking or a score is made: the factors, their weights, the data sources behind them. Show the rank and the result.

## 2. Before launch

1. **Fix the website contact before sending anyone there.** The footer on www.clearskyomega.com still lists an info@ address on the retired legacy domain, and "Request a demo" should reach a clearsky-usa.com inbox somebody reads. The site also lists an AHJ Approval Portal, which the product marks coming soon. Bring the site in line with what ships.
2. **Know where prices still show.** The posts no longer mention or link to prices, but the public price list (silmarillion.clearskyomega.com/offerings) and the package step of signup still show them to anyone who finds them. Hiding them is a product change: say if you want it. Card payment at signup is also still switched off in production.
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
| Button | Visit website → https://www.clearskyomega.com |

**About** (1441/2,000 characters)

```text
Developers run one project through a stack of disconnected tools: a grid-data subscription, a GIS seat, a sizing spreadsheet, CAD, an estimating sheet, a pro forma, a data room and an inbox full of RFQs. Every hand-off is re-keyed, and by the time a lender opens the model the numbers no longer match the drawing.

ClearSky OMEGA replaces the stack with one record, from the first look at a parcel to the day the project is funded.

• Screen: substations, lines and hosting capacity around a site, with an interconnection pre-screen, before you option the land.
• Design: lay out battery storage, solar, EV charging, microgrids and compute campuses on live satellite. Guided builds place the equipment, route the conduit and check NFPA 855 separations as you draw.
• Size and model: battery sizing against the real load and tariff, an 8,760-hour dispatch, and a pro forma that reconciles to it.
• Draw and price: plot plans, one-lines and permit sheets from the same model; an estimate and bill of materials that follow the design; requests for quote to the vendors on the BOM.
• Finance: investment analysis and a financing application built from the numbers already on the record.
• Operate: O&M, SLAs, field service and owner reporting once the asset is built.

Built for developers, EPCs, installers and equipment makers. It runs in any browser with nothing to install. Every new company gets a 14-day trial.

Start at clearskyomega.com.
```

**Specialties** (18/20): Battery energy storage (BESS), Solar + storage, EV charging infrastructure, Microgrids, Data center power, Interconnection screening, Hosting capacity, Site selection, Energy project development software, Storage sizing, Value stack modeling, Pro forma modeling, Plan sets and one-line diagrams, Bill of materials and RFQ, Project finance, NFPA 855, O&M and asset management, White-label energy software

## 4. The 30-day calendar

Day 1 is a Monday. One post a day; weekend posts are light. The link goes in the first comment, not the post. Up to three hashtags. The founder reshares weekday posts from their own profile with a line of their own.

### Day 1 (Mon) · Launch: Drop a Site

*Drop a Site · Image.* Visual: The card. Answer each entry within 24 hours with results only (nearest substations and lines, published hosting capacity), never how the screen works. A Grid Atlas screenshot is fine with the coordinates cropped. Graphic: `day01.png` (drop).

```text
We built ClearSky OMEGA so a developer can screen, design and build an energy site in one place instead of eight tools.

Talk is cheap. Let's play.

Drop an address or a ZIP code in the comments. We'll screen the grid around the first 10 and reply with what we find: the nearest substations and lines, and the hosting capacity where the utility publishes it.

Commercial and industrial sites only. No sign-up, no catch.

Every Monday from here on. Drop a site.

#EnergyStorage #Interconnection #BESS
```

First comment: Want your whole pipeline screened, not one site? Comment BUILD or send us a message and we'll set up a live build.

### Day 2 (Tue) · Build Tuesday: a battery site

*Build Tuesday · Video.* Visual: Best with a 30–60 s sandbox recording of exactly these steps (the card is its cover). Without a recording, post the card. Graphic: `day02.png` (stopwatch).

```text
Build Tuesday.

Type an address. Pick BESS Build. Watch it lay out.

Pads, PCS, transformer, fence, conduit and trench home runs, placed for you, with NFPA 855 and IFC 1207 separations checked while it draws. Then the one-line and the bill of materials, from the same model.

No re-keying. No waiting on a drafter for the concept.

What should we build next Tuesday: an EV hub, solar + storage, or a data center? Vote in the comments.

#BESS #EnergyStorage #SiteDesign
```

### Day 3 (Wed) · Spot the problem

*Guess & Spot · Image.* Visual: The card. Tomorrow's run posts the answer card as a comment on this post. Graphic: `day03.png` (plan).

```text
Spot the problem.

One of these four battery units gets the layout sent back by the fire marshal. Which one, and why?

Answer in the comments. We'll post the answer tomorrow.

#BESS #NFPA855 #FireSafety
```

Next day, as a comment on this post with `day03-answer.png`: Answer: unit 1. It sits closer to the existing building than the fire code allows (NFPA 855 and IFC 1207 set the separations; your AHJ has the final word). In OMEGA the separations are checked the moment you place a unit, so it never reaches the fire marshal.

### Day 4 (Thu) · Count your stack

*Count Your Stack · Image.* Visual: The card. Graphic: `day04.png` (checklist).

```text
Count your stack.

Tick every tool that touches one of your projects before NTP:

☐ Grid or hosting-capacity data
☐ GIS seat or analyst
☐ Sizing spreadsheet
☐ CAD seat or drafter
☐ Estimating sheet
☐ Pro forma model
☐ Data room
☐ RFQs by email

Now write what each one costs you a month. That total is the number to beat.

Comment your score. 6 or more and you're carrying the stack OMEGA was built to replace.

#EnergyStorage #ProjectDevelopment #SolarDevelopment
```

### Day 5 (Fri) · Speedrun Friday: guess the time

*Speedrun Friday · Image.* Visual: Record the run first (sandbox, clock on screen, one take). Post this card at 8 AM; post the video at noon with the real time. Never state a time you did not record. Graphic: `day05.png` (stopwatch).

```text
Speedrun Friday.

An address to a battery layout, sized, with a proposal. One take, clock on screen, no cuts.

Before you watch: how long does it take? Guess in the comments.

Closest guess gets a live build of their own site with us.

Video drops at noon.

#BESS #EnergyStorage #ProjectDevelopment
```

### Day 6 (Sat) · Site Leaderboard: 36 sites

*Site Leaderboard · Image.* Visual: The card (illustrative). Better: run a real folder through the screening register and post that ranking with the site names removed. Graphic: `day06.png` (leaderboard).

```text
36 sites. One sitting. Three worth the drive.

Drop a folder of site KMZs into OMEGA's screening register and it ranks them: terrain, buildable area, the grid picture alongside. Your week goes to the top of the list, not the bottom.

What's the most sites you've screened in one week the old way? Be honest.

(Sample sites, illustrative scores.)

#SiteSelection #SolarDevelopment #EnergyStorage
```

### Day 7 (Sun) · A hosting capacity map is a filter

*Field Notes · Image.* Visual: The card. Graphic: `day07.png` (compare).

```text
A hosting capacity map is a filter. Not an answer.

It tells you roughly how much new generation a feeder section could take on the day the utility ran the study.

It doesn't tell you what's already in the queue ahead of you, how old the study is, or what the upgrade costs if you're over the line.

We put the filter next to every parcel, so the sites that fail it never get optioned.

What's the worst surprise a hosting map ever gave you?

#Interconnection #HostingCapacity #SolarDevelopment
```

### Day 8 (Mon) · Drop a Site: data center edition

*Drop a Site · Image.* Visual: The card. Same rules as every Drop a Site: results only, within 24 hours. Graphic: `day08.png` (drop).

```text
Drop a Site: data center edition.

Comment an address or a ZIP where you think a data center could land. We'll screen the grid around the first 10 and reply with the nearest substations and lines, plus the hosting capacity where the utility publishes it.

Commercial and industrial sites only.

Data centers don't shop for acreage. They shop for interconnection. Let's see who's got it.

#DataCenters #Interconnection #PoweredLand
```

### Day 9 (Tue) · Build Tuesday: a fast-charging hub

*Build Tuesday · Video.* Visual: Best with a 30–60 s sandbox recording (the card is its cover). Without one, post the card. Graphic: `day09.png` (stopwatch).

```text
Build Tuesday: a fast-charging hub.

Type an address. Pick DCFC Build. The chargers, switchgear and transformer land on the site, the load gets checked against what the grid can serve, and a DCFC pro forma fills in: utilization, IRR, payback.

Add a battery to shave the demand charge and watch the payback move.

What should we build next Tuesday?

#EVCharging #DCFC #EVInfrastructure
```

### Day 10 (Wed) · Quiz: what a hosting map tells you

*Guess & Spot · Image.* Visual: The card. Tomorrow's run posts the answer as a comment. Graphic: `day10.png` (quiz).

```text
Quiz.

Which of these can a utility's hosting capacity map actually tell you?

A) Your place in the queue
B) Your upgrade cost
C) Roughly what a feeder could take when it was studied
D) When your study will finish

Answer in the comments. Answer tomorrow.

#Interconnection #HostingCapacity #SolarDevelopment
```

Next day, as a comment on this post: Answer: C. A hosting capacity map shows roughly how much a feeder section could take when the utility studied it. The queue, the upgrade cost and the study timeline are not on it. It's a first filter, and OMEGA puts that filter next to every parcel.

### Day 11 (Thu) · Count your re-keys

*Count Your Stack · Image.* Visual: The card. Graphic: `day11.png` (checklist).

```text
The re-key tax.

Count how many times one number gets typed twice on a project:

☐ Layout → estimate
☐ Sizing → pro forma
☐ Estimate → RFQ
☐ Pro forma → lender model
☐ Drawing → permit set
☐ Site list → CRM

Every tick is time gone and a chance to be wrong. In OMEGA they all read the same record.

Comment your count.

#ProjectDevelopment #EnergyStorage
```

### Day 12 (Fri) · Speedrun Friday: 10 sites

*Speedrun Friday · Image.* Visual: Record the run first (sandbox or a real folder with names removed, clock on screen, one take). Card at 8 AM, video at noon with the real time. Graphic: `day12.png` (stopwatch).

```text
Speedrun Friday: 10 sites, screened and ranked.

One folder of KMZs in, a ranked list out, then layouts on the top three. Clock on screen, one take.

Guess the time before the video drops at noon. Closest guess gets a live build of their own site.

#SiteSelection #EnergyStorage #SolarDevelopment
```

### Day 13 (Sat) · A developer's week, one record

*Site Leaderboard · Carousel.* Visual: Upload the PDF as a document post (Add a document), titled "A developer's week". Graphic: `day13.png` (carousel).

```text
A developer's week, on one record.

Mon: screen five parcels against the grid.
Tue: lay out the best two on satellite.
Wed: size the storage against the tariff.
Thu: pull the one-line, the BOM and the estimate.
Fri: run the investment analysis and send it to capital.

Same project, same numbers, one login. Swipe through →

How long does that week take you today?

#ProjectDevelopment #EnergyStorage #SolarDevelopment
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

### Day 15 (Mon) · Drop a Site: the one nobody wants

*Drop a Site · Image.* Visual: The card. Results only, within 24 hours. Graphic: `day15.png` (drop).

```text
Drop a Site: the one nobody wants.

Comment the site everyone told you wouldn't work. We'll screen the grid around the first 10 and reply with what's actually there.

Commercial and industrial sites only.

#EnergyStorage #Interconnection #SolarDevelopment
```

### Day 16 (Tue) · Build Tuesday: a compute campus

*Build Tuesday · Video.* Visual: Best with a sandbox recording (the card is its cover). Graphic: `day16.png` (stopwatch).

```text
Build Tuesday: a compute campus.

Start with the load you want. OMEGA lays out the campus against what the grid will carry, shows the gap, and sizes the generation and storage that closes it. You know whether the site can hold the load before anyone signs anything.

Compute & Data Center is in limited trial. Want in? Say so in the comments.

#DataCenters #Interconnection #PoweredLand
```

### Day 17 (Wed) · Spot the problem, round 2

*Guess & Spot · Image.* Visual: The card. Tomorrow's run posts the answer card as a comment. Graphic: `day17.png` (plan).

```text
Spot the problem, round 2.

The fire truck needs to get in. Which unit is in its way?

Answer in the comments. Answer tomorrow.

#BESS #FireSafety #SiteDesign
```

Next day, as a comment on this post with `day17-answer.png`: Answer: unit 3. It's parked in the fire access lane, and the AHJ will send it back. In OMEGA the fix is one drag: move the unit, and the trench, the conduit schedule and the estimate follow.

### Day 18 (Thu) · What one platform replaces

*Count Your Stack · Image.* Visual: The card. Graphic: `day18.png` (list).

```text
Ditch the stack: what one platform replaces.

Grid and hosting-capacity data → Grid Atlas
Site-screening consultant or GIS time → Site Intelligence
Battery-sizing and revenue spreadsheets → Storage Sizing & Revenue
CAD seat and outsourced drafting → Plan Sets & CAD
Estimating sheets and RFQs by email → Estimate, BOM & Procurement
The analyst-built pro forma → Investor & Finance
An asset-management platform → Operations

Add up what you pay for the left column today. That's the number to beat.

#EnergyStorage #SolarDevelopment #CleanEnergy
```

### Day 19 (Fri) · Speedrun Friday: move it once

*Speedrun Friday · Image.* Visual: Record the revision first (sandbox, clock on screen). Card at 8 AM, video at noon with the real time. Graphic: `day19.png` (stopwatch).

```text
Speedrun Friday: move it once.

Drag the battery 40 feet. Count what updates on its own: the trench re-routes, the conduit schedule re-counts, the estimate follows.

Guess how long the whole revision takes. Video at noon.

#BESS #Engineering #EPC
```

### Day 20 (Sat) · Poll: what slows your pipeline?

*Conversation · Poll.* Visual: LinkedIn poll, one week. Options: Interconnection · Land and site control · Financing · Equipment and supply

```text
What slows your pipeline down most right now?
```

### Day 21 (Sun) · Model the year, not the peak

*Field Notes · Image.* Visual: The card. Graphic: `day21.png` (statement).

```text
If your battery was sized to the peak, it was sized on one hour of the year.

A peak-shaving estimate is the worst hour of the month, multiplied out. OMEGA runs the system through all 8,760 hours instead: demand charges, time-of-use, capacity, the programs the site can enroll in, and the battery's own limits.

When the lender asks where a number came from, the answer is an hour of the year. Not a cell.

How was your last battery sized?

#EnergyStorage #ValueStack #BESS
```

### Day 22 (Mon) · Drop a Site: fleet depot edition

*Drop a Site · Image.* Visual: The card. Results only, within 24 hours. Graphic: `day22.png` (drop).

```text
Drop a Site: fleet depot edition.

Comment a depot, a truck stop or a lot where you'd put fast chargers. We'll screen the grid around the first 10 and reply with what's there.

Commercial and industrial sites only.

#EVCharging #FleetElectrification #DCFC
```

### Day 23 (Tue) · Build Tuesday: solar + storage

*Build Tuesday · Video.* Visual: Best with a sandbox recording (the card is its cover). Graphic: `day23.png` (stopwatch).

```text
Build Tuesday: solar + storage.

Address in. The array laid out, the battery sized to the load and the tariff, the whole system dispatched across 8,760 hours, and a pro forma that reads from it.

What should we build next?

#SolarPlusStorage #EnergyStorage #CommercialSolar
```

### Day 24 (Wed) · What kills more battery projects?

*Guess & Spot · Image.* Visual: The card. Next week's run can share the tally from the comments. Graphic: `day24.png` (quiz).

```text
No right answer on this one. Tell us what you've lived.

What kills more battery projects?

A) Interconnection
B) Local permits
C) Financing
D) Equipment and supply

We'll share the tally next week.

#EnergyStorage #BESS #Interconnection
```

### Day 25 (Thu) · Five quotes, five call lists

*Count Your Stack · Image.* Visual: The card. Graphic: `day25.png` (statement).

```text
Ask five vendors for a quote and you're on five call lists. For good.

The bill of materials in OMEGA writes itself as equipment lands on the drawing. When you're ready, send a request for quote to the vendors on it.

Each vendor sees only their own lines. Your company stays anonymous until you accept a quote.

How many vendors call you a week?

#Procurement #EnergyStorage #BESS
```

### Day 26 (Fri) · Speedrun Friday: the full run

*Speedrun Friday · Image.* Visual: Record the full run first (sandbox, clock on screen, one take). Card at 8 AM, video at noon with the real time. Graphic: `day26.png` (stopwatch).

```text
Speedrun Friday: the full run.

Address to a proposal a customer could sign: grid check, layout, sizing, one-line and estimate, proposal. One take, no cuts, clock on screen.

Guess the time. Closest guess gets a live build of their own site. Video at noon.

#BESS #EnergyStorage #ProjectDevelopment
```

### Day 27 (Sat) · Site Leaderboard: 24 C&I sites

*Site Leaderboard · Image.* Visual: The card (illustrative). Better: a real folder's ranking with the site names removed. Graphic: `day27.png` (leaderboard).

```text
24 C&I sites. One sitting. Here's the top of the board.

Every site ranked, every one with the grid picture alongside. The bottom of the list costs you nothing, because you never drive there.

Which would you visit first, and why?

(Sample sites, illustrative scores.)

#SiteSelection #EnergyStorage #CommercialSolar
```

### Day 28 (Sun) · What a lender looks for

*Field Notes · Image.* Visual: The card. Graphic: `day28.png` (list).

```text
What a lender looks for in a storage pro forma.

1. Revenue that ties back to an hourly dispatch, not a single peak.
2. Degradation, and the warranty that covers it, year by year.
3. Augmentation: when capacity gets added back and what it costs.
4. Every assumption stated, with its source.
5. A layout and an estimate that match the model.

OMEGA keeps the dispatch, the degradation, warranty and augmentation model, the layout and the estimate on one record.

What would you add?

#ProjectFinance #EnergyStorage
```

### Day 29 (Mon) · Drop a Site: this time we build it

*Drop a Site · Image.* Visual: The card. For the first 3 entries, build a layout in OMEGA and reply with a screenshot of the layout only. Graphic: `day29.png` (drop).

```text
Four weeks of Drop a Site. One more round, and this time we build it.

Comment an address. The first 3 get a layout, not just a screen: the equipment placed, the separations checked, the site drawn.

Commercial and industrial sites only.

Ditch the stack.

#EnergyStorage #BESS #SiteDesign
```

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

**The offer.** A 20-minute live build of one of their sites from an address, then a 14-day trial on their own sites. Pricing is for the call, never in writing, until the founder says otherwise; the starting package and its price are docs/VALUE-LADDER-PACKAGING.md §3.6 and the price book.

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
{First}, easier than a call: send me one of your sites (an address is enough) and I'll screen it before we talk. The grid picture around it, what fits on the parcel, a first layout. No prep on your side.

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
| Weekly | Comments per post, Drop a Site entries, guesses and votes, new followers, profile visits, BUILD requests, live builds booked, trial requests |
| Monthly | Trials approved, trials that built a project, trials converted to paid, paid revenue added |
| Starting targets (adjust after week 2) | 10+ comments on each series post, 5 live builds booked and 2 trial requests a week |

## 5b. Small shops: a design and estimating department in a browser

**Who.** Commercial solar, storage and EV installers, small EPCs and electrical contractors, about 3 to 100 people, where the owner, a PM or one estimator does layouts and estimates by hand, in spreadsheets and CAD, one job at a time.

**Signal.** Best signal: a current job post for a solar designer, PV designer, CAD drafter, estimator or pre-construction role. They are paying to build what OMEGA does. Next best: a utility or state approved-contractor list, a new C&I project, a new office.

**Pitch.** Type an address, pick the build, and OMEGA places the equipment, checks the fire-code separations, draws the one-line and writes the bill of materials and the estimate. A small team designs and quotes like a big one.

**Offer.** Send an address from a job you are quoting now and we build it live with you in 20 minutes. Then 14 days on your own jobs. Pricing on the call.

**Finding them on LinkedIn**

- **Jobs (the hiring signal):** Jobs search, past month: "solar designer" OR "PV designer" OR "solar estimator" OR "CAD drafter" solar OR "pre-construction" solar. Every company that comes back is a lead.
- **People:** Titles: Owner, President, Operations Manager, Estimating Manager, Estimator, Project Manager, Director of Pre-construction. Keywords: solar OR "energy storage" OR "EV charging". Company size 2–50 and 51–200. Your states first.
- **Companies:** Industries: Solar Electric Power Generation, Renewable Energy Power Generation, Electrical contractors (Specialty Trade Contractors). Size 2–200.

#### Day 1 · LinkedIn · Connection request (under 300 characters)

```text
Hi {First}, saw {Company} is growing its design and estimating side. We built a tool that does the layout, the one-line and the estimate from an address, so a small team can quote like a big one. Would be good to connect.
```

#### After they accept · LinkedIn · DM

```text
Thanks for connecting, {First}. Most shops your size do layouts and estimates one job at a time, in spreadsheets and CAD. OMEGA does the layout, the one-line, the bill of materials and the estimate from an address, in one place. Send me an address from a job you're quoting and I'll build it live with you in 20 minutes. Worth a look?
```

#### Not connected · InMail · InMail (Premium credit)

Subject: `Your next {solar / battery / EV} layout`

```text
{First}, saw {hook}.

If your team does layouts and estimates by hand, here's a faster way: type an address, pick the build, and OMEGA places the equipment, checks the fire-code separations, draws the one-line and writes the bill of materials and the estimate.

Send me an address from a job you're quoting and I'll build it with you live in 20 minutes. No prep on your side.

{Sender}, ClearSky OMEGA
```

#### A week later · LinkedIn · Follow-up

```text
{First}, one more idea: this week's Build Tuesday post shows a {build} going from an address to a layout. If you'd rather see it on one of your own jobs, the offer stands: one address, 20 minutes. {post link}
```

**Careful**

- Their job post is public, so it is fair to mention; never mention anything you learned any other way.
- Build their site live in your own workspace; never send them a file of it before they have a workspace and have accepted the terms.

## 5c. Big organizations: find the team their tools miss

**Who.** Large developers and IPPs with a distributed, C&I or community-solar arm; large EPCs with a solar, storage or EV practice; utility DER and EV programs; battery OEMs and integrators with a dealer or installer channel.

**Signal.** Most have tools already. Do not pitch a replacement. Find the smaller team the big tools do not serve: DG or C&I origination screening dozens of small sites, a regional office, an interconnection team, or a channel of installers who need to quote the company's product.

**Pitch.** OMEGA runs alongside the tools they have: dozens of small sites screened and laid out fast enough to make small projects worth doing, proposals for field sales, and a white-labelled version for their installer network.

**Offer.** A 30-minute session on a handful of their own sites (under NDA if they bring their data), then a scoped pilot: one team, one region, 90 days, written up before it starts. Pricing on the call.

**Finding them on LinkedIn**

- **Companies:** Company size 1,001+ (and 501–1,000) in Renewable Energy Power Generation, Utilities and Construction; or upload the enterprise list as a company list.
- **People (the entry team, not the C-suite):** Titles: Director or VP of Distributed Generation, C&I Origination, Community Solar Development, Interconnection Manager, Channel Partner or Dealer Program Manager, Regional Development Director.
- **Signals:** A new DG or C&I team, a state or utility program win, a channel or dealer program launch, job posts for GIS analysts or solar designers in a regional office.

**Discovery questions** (the call, not the message)

- How long from a site lead to a first layout with an estimate, and who does it?
- How many sites does origination screen a month, and how many get a real look?
- Where do numbers get re-keyed between origination, engineering and finance?
- What do your installers or channel partners use to quote your product?
- Which projects are too small to be worth your current process?

#### Day 1 · LinkedIn · Connection request (under 300 characters)

```text
Hi {First}, I work with development teams on early-stage screening and design. Saw {hook}. Would be good to connect.
```

#### After they accept · LinkedIn · DM: a question, not a pitch

```text
{First}, a question rather than a pitch: when your team gets a batch of small C&I or DG sites, how long does it take to get from a list to a first layout with an estimate? We built OMEGA for exactly that stretch, and it runs alongside the tools you already have. If it's useful, I can show it on a handful of your sites, under NDA if you'd rather.
```

#### For an OEM or integrator · LinkedIn · DM: the channel angle

```text
{First}, how do your installers quote your systems today? We run a version of OMEGA under a manufacturer's own name, so its dealers size, lay out and quote the product the same way every time. Happy to show you how that looks.
```

**Careful**

- Check the risk column first. A company that sells design or screening software is a competitor: no demo, no trial, decline its signup at approval.
- Demo in the sandbox with invented data. How the model works and what data sits behind it is for a signed NDA only, and even then show outputs.
- No trial workspace without a named sponsor who has accepted the terms. A pilot is scoped (one team, one region, 90 days) and written up first.
- Never send exports of model internals or a screen of the admin console, and never name another customer.
- Several people per company is fine (origination, engineering, finance), one thread each; never a blast.

## 4a. The recordings

Build Tuesday and Speedrun Friday need a real screen recording. Setup:

- Record on a computer, not a phone: macOS Shift-Command-5, "Record Selected Portion", around the browser window only.
- Browser full screen (Control-Command-F) so the address bar, bookmarks and other tabs are off camera. Notifications off.
- A fresh project in your own workspace, on a real commercial or industrial address you are free to show (never a customer's site or a site under negotiation).
- For a Speedrun, open the Clock app's stopwatch in a small window inside the recorded area and start it on camera. One take, no cuts.
- Post the video with its card as the thumbnail, and one line of on-screen text or captions: most people watch muted.

**Never on camera:**

- The inputs and assumptions panels (BESS Sizer inputs, value-stack settings, pro forma assumptions): show the result screen only.
- Unit costs and rate columns in the estimate or BOM: show quantities, or the total for a second, never the rates.
- The Output tab's API Keys and AI Tokens panels, Settings, the console, or your project list (it names customers).
- The address bar, any other company's name or data, and any email or chat window.

**Day 2 · BESS build** (30–60 s, trimmed)

1. Build tab → 1 · Site → Site Setup: type the address, lock the map.
2. 2 · Build → BESS Build: place the battery; the trench snaps BESS → transformer → switchgear → meter → POI.
3. Pause on the separation check (NFPA 855) for two seconds.
4. Output tab → One-Line: the one-line appears from the same model.
5. Estimate tab → BOM: two seconds on the quantities.

**Day 5 · Speedrun: address to proposal** (one take, clock on screen)

1. Start the stopwatch on camera.
2. Site Setup: the address.
3. Grid Atlas: the substations and lines around the site (crop nothing, but do not open data-source panels).
4. BESS Build: the layout.
5. 3 · Size & Configure → BESS Sizer: go straight to the result screen.
6. Output tab → Proposal. Stop the clock. Post the real time.

**Day 9 · EV fast-charging hub** (30–60 s, trimmed)

1. Site Setup: a lot or a depot.
2. Build tab → DCFC: the chargers, switchgear and transformer land.
3. The load checked against what the grid can serve.
4. The DCFC pro forma result: utilization, IRR, payback. The result, not the inputs.

**Day 12 · Speedrun: 10 sites ranked** (one take, clock on screen)

1. Start the stopwatch.
2. Load a folder of 10 site KMZs into the parcel screening register (your own pipeline with the names changed, or public sample parcels).
3. The ranked list appears. Show the rank and the score, never the factors or weights behind it.
4. Open the top 3 and lay out the first one. Stop the clock.

**Day 16 · Compute campus** (30–60 s, trimmed)

1. Compute tab → Compute Build on a large parcel.
2. The load asked for against what the grid will carry: the gap.
3. The generation and storage that close it. Say on screen that Compute is in limited trial.

**Day 19 · Speedrun: move it once** (one take, clock on screen)

1. Start the stopwatch on a finished BESS layout.
2. Select the battery and drag it about 40 feet.
3. The trench re-routes; the conduit schedule re-counts; the estimate total updates. Stop the clock.

**Day 23 · Solar + storage** (30–60 s, trimmed)

1. Site Setup: a C&I roof or ground site.
2. Build tab → Solar + Storage: the single-pass flow from the POI to the array.
3. Solar → BESS Sizer: the battery sized to what was drawn. Result screen only.
4. The pro forma result.

**Day 26 · Speedrun rematch: the full run** (one take, clock on screen)

1. The day-5 run again, plus the one-line and the estimate, after a month of practice.
2. Say on screen whether you beat the day-5 time. Post the real time either way.

## 5d. Ads (the page's ad credit)

| | |
|---|---|
| Budget | The page's ad credit, over about two weeks. Most of it on small shops; a small slice on a company-list audience. |
| Small shops | Company size 2–200; industries Solar Electric Power Generation, Renewable Energy Power Generation and electrical contractors; titles Owner, President, Operations Manager, Estimator, Project Manager, Solar Designer; United States. Creative: the Build Tuesday or Score Your Stack card. Call to action: Follow. |
| Company list | Upload the developer and enterprise lists as a company list (Matched Audiences). Show them Field Notes and Site Leaderboard posts, so the name is familiar before the first message. |
| Developers | Titles VP or Director of Development, Development Manager, Interconnection Manager, Head of Origination, Founder or CEO; company size 11–500. Creative: the Drop a Site card. |

## 6. Target accounts

- Small shops: `docs/small-shop-targets.csv` (to come).
- Big organizations: `docs/enterprise-targets.csv` (to come).

`docs/developer-targets.csv` (50 companies, public sources, company-level only; no personal contact data). Read the source before you write: a hook is only as good as its date. Check the growth board and the off-limits list before the first touch; a company that signs up leaves this list.

## 7. The daily run

One run each morning: news check, the post, its graphic, the guardrail check, delivered ready to paste (or queued in a connected scheduler for approval). The graphics come from `scripts/marketing/` (`build.py`, then `card.js`; fonts are embedded, no network). Prompt:

> Daily LinkedIn post for ClearSky OMEGA. Read CLAUDE.md and docs/GO-TO-MARKET.md (the guardrails, the voice and the news rules). 1) Today's calendar day: day 1 is [START DATE], one post a day. 2) Search the last 72 hours of energy-development news. If something clears the news rules, write a timely post in the voice instead of the calendar post, with its source for the first comment and a card spec in the same shape as content.py; otherwise take the calendar post and sharpen its first line if you can. 3) Check it against the guardrails and the list of what does not ship; say what you changed. 4) Render the graphic: python3 scripts/marketing/build.py <out>, then node scripts/marketing/card.js <out>/cards.json <out> <dayNN> (a timely post: a one-card JSON of your own). 5) Deliver it ready to paste: the graphic (and the PDF for a carousel), the post, the first comment and today's engagement list. With a scheduler connected, queue it there as a draft for approval instead. Never publish without the founder's approval. 6) Mondays: last week's numbers if the scheduler reports them, and what to do more of. After day 30, write the next week in the same pillars and voice and ask before using it.

## 8. Not done

- Nothing has been posted or sent. There is no LinkedIn connector in this session.
- The screen recordings (days 3, 10, 24) are described, not made; each has a card to post instead.
- The website contact, the pay-now switch and the sender mailbox (§2) are open.
- Prospects are a CSV, not the `prospects/` board `docs/SALES-AGENT.md` §5 designs.
