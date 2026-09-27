# -*- coding: utf-8 -*-
# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
#
# content.py — THE one source for the go-to-market kit. build.py renders it
# into docs/GO-TO-MARKET.md, the copy-and-paste page and cards.json;
# card.js renders cards.json into the post graphics. Change the words here,
# never in a rendered file. No price appears in anything public (pricing is
# for the call; build.py refuses a dollar sign); every claim is something that
# ships.

LINKS = {
    'site': 'https://www.clearskyomega.com',
    'trial': 'https://silmarillion.clearskyomega.com/start',
    'demo': 'https://www.clearskyomega.com/contact.html',
}

PAGE = {
    'name': 'ClearSky OMEGA',
    'tagline': 'One platform from parcel to funded project. Screen, design, size, price and finance energy sites on one record.',
    'website': LINKS['site'],
    'industry': 'Software Development',
    'button': 'Visit website → ' + LINKS['site'],
    'about': (
        "Developers run one project through a stack of disconnected tools: a grid-data subscription, a GIS seat, "
        "a sizing spreadsheet, CAD, an estimating sheet, a pro forma, a data room and an inbox full of RFQs. Every "
        "hand-off is re-keyed, and by the time a lender opens the model the numbers no longer match the drawing.\n\n"
        "ClearSky OMEGA replaces the stack with one record, from the first look at a parcel to the day the project is funded.\n\n"
        "• Screen: substations, lines and hosting capacity around a site, with an interconnection pre-screen, before you option the land.\n"
        "• Design: lay out battery storage, solar, EV charging, microgrids and compute campuses on live satellite. Guided builds place the "
        "equipment, route the conduit and check NFPA 855 separations as you draw.\n"
        "• Size and model: battery sizing against the real load and tariff, an 8,760-hour dispatch, and a pro forma that reconciles to it.\n"
        "• Draw and price: plot plans, one-lines and permit sheets from the same model; an estimate and bill of materials that follow the "
        "design; requests for quote to the vendors on the BOM.\n"
        "• Finance: investment analysis and a financing application built from the numbers already on the record.\n"
        "• Operate: O&M, SLAs, field service and owner reporting once the asset is built.\n\n"
        "Built for developers, EPCs, installers and equipment makers. It runs in any browser with nothing to install. "
        "Every new company gets a 14-day trial.\n\n"
        "Start at clearskyomega.com."
    ),
    'specialties': [
        'Battery energy storage (BESS)', 'Solar + storage', 'EV charging infrastructure', 'Microgrids',
        'Data center power', 'Interconnection screening', 'Hosting capacity', 'Site selection',
        'Energy project development software', 'Storage sizing', 'Value stack modeling', 'Pro forma modeling',
        'Plan sets and one-line diagrams', 'Bill of materials and RFQ', 'Project finance', 'NFPA 855',
        'O&M and asset management', 'White-label energy software',
    ],
}

# Day 1 is Monday 2026-09-28. Every week runs the same seven series, so
# people know what is coming and come back for it:
#   Mon Drop a Site · Tue Build Tuesday · Wed Guess & Spot · Thu Count Your Stack
#   Fri Speedrun Friday · Sat Site Leaderboard · Sun Field Notes
# card: the graphic card.js renders (None: no graphic). answer: for a quiz,
# the reveal the next day's run posts as a comment on this post (answer_card
# is its graphic). No prices anywhere public: pricing is for the call.
POSTS = [
 dict(day=1, pillar='drop', fmt='Image', title='Launch: Drop a Site',
  visual="The card. Answer each entry within 24 hours with results only (nearest substations and lines, published hosting capacity), never how the screen works. A Grid Atlas screenshot is fine with the coordinates cropped.",
  text="""We built ClearSky OMEGA so a developer can screen, design and build an energy site in one place instead of eight tools.

Talk is cheap. Let's play.

Drop an address or a ZIP code in the comments. We'll screen the grid around the first 10 and reply with what we find: the nearest substations and lines, and the hosting capacity where the utility publishes it.

Commercial and industrial sites only. No sign-up, no catch.

Every Monday from here on. Drop a site.

#EnergyStorage #Interconnection #BESS""",
  comment="Want your whole pipeline screened, not one site? Comment BUILD or send us a message and we'll set up a live build.",
  card=dict(kind='drop', eyebrow='Drop a Site · every Monday', headline="Drop a site. We'll screen it.",
            sub='Comment an address or a ZIP. The first 10 get the grid picture around it, in the replies.',
            prompt='Comment an address or ZIP')),

 dict(day=2, pillar='build', fmt='Video', title='Build Tuesday: a battery site',
  visual="Best with a 30–60 s sandbox recording of exactly these steps (the card is its cover). Without a recording, post the card.",
  text="""Build Tuesday.

Type an address. Pick BESS Build. Watch it lay out.

Pads, PCS, transformer, fence, conduit and trench home runs, placed for you, with NFPA 855 and IFC 1207 separations checked while it draws. Then the one-line and the bill of materials, from the same model.

No re-keying. No waiting on a drafter for the concept.

What should we build next Tuesday: an EV hub, solar + storage, or a data center? Vote in the comments.

#BESS #EnergyStorage #SiteDesign""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Build Tuesday', headline='Type an address. Watch it build.', clock='GO',
            laps=['Address', 'BESS Build', 'Layout, NFPA 855 checked', 'One-line', 'Bill of materials'],
            prompt='Vote: what do we build next week?')),

 dict(day=3, pillar='quiz', fmt='Image', title='Spot the problem',
  visual="The card. Tomorrow's run posts the answer card as a comment on this post.",
  text="""Spot the problem.

One of these four battery units gets the layout sent back by the fire marshal. Which one, and why?

Answer in the comments. We'll post the answer tomorrow.

#BESS #NFPA855 #FireSafety""",
  comment="",
  card=dict(kind='plan', variant='building', eyebrow='Spot the problem · Wednesday', headline='Which unit gets rejected?',
            prompt='Comment 1, 2, 3 or 4, and why'),
  answer="""Answer: unit 1. It sits closer to the existing building than the fire code allows (NFPA 855 and IFC 1207 set the separations; your AHJ has the final word). In OMEGA the separations are checked the moment you place a unit, so it never reaches the fire marshal.""",
  answer_card=dict(kind='plan', variant='building', flag=1, flagText='Unit 1: too close to the building',
                   eyebrow='The answer', headline='Unit 1.')),

 dict(day=4, pillar='stack', fmt='Image', title='Count your stack',
  visual="The card.",
  text="""Count your stack.

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

#EnergyStorage #ProjectDevelopment #SolarDevelopment""",
  comment="",
  card=dict(kind='checklist', eyebrow='Count Your Stack · Thursday', headline='Score your stack.',
            items=['Grid or hosting-capacity data', 'GIS seat or analyst', 'Sizing spreadsheet', 'CAD seat or drafter',
                   'Estimating sheet', 'Pro forma model', 'Data room', 'RFQs by email'],
            scale=[['0–2', 'Lean'], ['3–5', 'Heavy'], ['6–8', 'Ditch it']],
            prompt='Comment your score')),

 dict(day=5, pillar='speed', fmt='Image', title='Speedrun Friday: guess the time',
  visual="Record the run first (sandbox, clock on screen, one take). Post this card at 8 AM; post the video at noon with the real time. Never state a time you did not record.",
  text="""Speedrun Friday.

An address to a battery layout, sized, with a proposal. One take, clock on screen, no cuts.

Before you watch: how long does it take? Guess in the comments.

Closest guess gets a live build of their own site with us.

Video drops at noon.

#BESS #EnergyStorage #ProjectDevelopment""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Speedrun Friday', headline='Guess our time.', clock='?:??',
            laps=['Address', 'Grid check', 'BESS layout', 'Sizing', 'Proposal'],
            prompt='Guess in the comments · video at noon')),

 dict(day=6, pillar='board', fmt='Image', title='Site Leaderboard: 36 sites',
  visual="The card (illustrative). Better: run a real folder through the screening register and post that ranking with the site names removed.",
  text="""36 sites. One sitting. Three worth the drive.

Drop a folder of site KMZs into OMEGA's screening register and it ranks them: terrain, buildable area, the grid picture alongside. Your week goes to the top of the list, not the bottom.

What's the most sites you've screened in one week the old way? Be honest.

(Sample sites, illustrative scores.)

#SiteSelection #SolarDevelopment #EnergyStorage""",
  comment="",
  card=dict(kind='leaderboard', eyebrow='Site Leaderboard · Saturday', headline='36 sites. Top 3 win.',
            note='Illustrative · sample sites',
            rows=[['Site 14', 92], ['Site 03', 88], ['Site 27', 85], ['Site 09', 71], ['Site 31', 66], ['Site 18', 58]],
            more='+ 30 more, ranked', prompt='Most sites you screened in one week?')),

 dict(day=7, pillar='teach', fmt='Image', title='A hosting capacity map is a filter',
  visual="The card.",
  text="""A hosting capacity map is a filter. Not an answer.

It tells you roughly how much new generation a feeder section could take on the day the utility ran the study.

It doesn't tell you what's already in the queue ahead of you, how old the study is, or what the upgrade costs if you're over the line.

We put the filter next to every parcel, so the sites that fail it never get optioned.

What's the worst surprise a hosting map ever gave you?

#Interconnection #HostingCapacity #SolarDevelopment""",
  comment="",
  card=dict(kind='compare', eyebrow='Field Notes · Sunday', headline='What a hosting capacity map tells you.',
            cols=[dict(title='Tells you', items=['How much new generation a feeder section could take', 'On the day the utility ran the study']),
                  dict(title="Doesn't tell you", items=["Who's in the queue ahead of you", 'How old the study is', "What the upgrade costs if you're over"])])),

 dict(day=8, pillar='drop', fmt='Image', title='Drop a Site: data center edition',
  visual="The card. Same rules as every Drop a Site: results only, within 24 hours.",
  text="""Drop a Site: data center edition.

Comment an address or a ZIP where you think a data center could land. We'll screen the grid around the first 10 and reply with the nearest substations and lines, plus the hosting capacity where the utility publishes it.

Commercial and industrial sites only.

Data centers don't shop for acreage. They shop for interconnection. Let's see who's got it.

#DataCenters #Interconnection #PoweredLand""",
  comment="",
  card=dict(kind='drop', eyebrow='Drop a Site · data center edition', headline='Where would you put 50 MW?',
            sub='Comment an address or a ZIP. The first 10 get the grid picture around it.', prompt='Comment an address or ZIP')),

 dict(day=9, pillar='build', fmt='Video', title='Build Tuesday: a fast-charging hub',
  visual="Best with a 30–60 s sandbox recording (the card is its cover). Without one, post the card.",
  text="""Build Tuesday: a fast-charging hub.

Type an address. Pick DCFC Build. The chargers, switchgear and transformer land on the site, the load gets checked against what the grid can serve, and a DCFC pro forma fills in: utilization, IRR, payback.

Add a battery to shave the demand charge and watch the payback move.

What should we build next Tuesday?

#EVCharging #DCFC #EVInfrastructure""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Build Tuesday', headline='An EV hub, from an address.', clock='GO',
            laps=['Address', 'DCFC Build', 'Load vs. grid', 'DCFC pro forma', 'Add storage'], prompt='What do we build next week?')),

 dict(day=10, pillar='quiz', fmt='Image', title='Quiz: what a hosting map tells you',
  visual="The card. Tomorrow's run posts the answer as a comment.",
  text="""Quiz.

Which of these can a utility's hosting capacity map actually tell you?

A) Your place in the queue
B) Your upgrade cost
C) Roughly what a feeder could take when it was studied
D) When your study will finish

Answer in the comments. Answer tomorrow.

#Interconnection #HostingCapacity #SolarDevelopment""",
  comment="",
  card=dict(kind='quiz', eyebrow='Quiz · Wednesday', headline='What does a hosting map actually tell you?',
            options=['Your place in the queue', 'Your upgrade cost', 'Feeder headroom when studied', 'When your study finishes'],
            prompt='Comment A, B, C or D'),
  answer="""Answer: C. A hosting capacity map shows roughly how much a feeder section could take when the utility studied it. The queue, the upgrade cost and the study timeline are not on it. It's a first filter, and OMEGA puts that filter next to every parcel."""),

 dict(day=11, pillar='stack', fmt='Image', title='Count your re-keys',
  visual="The card.",
  text="""The re-key tax.

Count how many times one number gets typed twice on a project:

☐ Layout → estimate
☐ Sizing → pro forma
☐ Estimate → RFQ
☐ Pro forma → lender model
☐ Drawing → permit set
☐ Site list → CRM

Every tick is time gone and a chance to be wrong. In OMEGA they all read the same record.

Comment your count.

#ProjectDevelopment #EnergyStorage""",
  comment="",
  card=dict(kind='checklist', eyebrow='Count Your Stack · Thursday', headline='Count your re-keys.',
            items=['Layout → estimate', 'Sizing → pro forma', 'Estimate → RFQ', 'Pro forma → lender model',
                   'Drawing → permit set', 'Site list → CRM'],
            scale=[['0–1', 'Clean'], ['2–3', 'Leaky'], ['4–6', 'Ditch it']], prompt='Comment your count')),

 dict(day=12, pillar='speed', fmt='Image', title='Speedrun Friday: 10 sites',
  visual="Record the run first (sandbox or a real folder with names removed, clock on screen, one take). Card at 8 AM, video at noon with the real time.",
  text="""Speedrun Friday: 10 sites, screened and ranked.

One folder of KMZs in, a ranked list out, then layouts on the top three. Clock on screen, one take.

Guess the time before the video drops at noon. Closest guess gets a live build of their own site.

#SiteSelection #EnergyStorage #SolarDevelopment""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Speedrun Friday', headline='10 sites. Guess our time.', clock='?:??',
            laps=['Load 10 KMZs', 'Grid picture', 'Terrain + buildable area', 'Rank', 'Top 3 layouts'],
            prompt='Guess in the comments · video at noon')),

 dict(day=13, pillar='board', fmt='Carousel', title="A developer's week, one record",
  visual="Upload the PDF as a document post (Add a document), titled \"A developer's week\".",
  text="""A developer's week, on one record.

Mon: screen five parcels against the grid.
Tue: lay out the best two on satellite.
Wed: size the storage against the tariff.
Thu: pull the one-line, the BOM and the estimate.
Fri: run the investment analysis and send it to capital.

Same project, same numbers, one login. Swipe through →

How long does that week take you today?

#ProjectDevelopment #EnergyStorage #SolarDevelopment""",
  comment="",
  card=dict(kind='carousel', slides=[
      dict(eyebrow='Swipe →', headline="A developer's week, on one record.", sub='Five days. One project. One login.'),
      dict(eyebrow='Monday · Screen', headline='Screen five parcels against the grid.', sub='Substations, lines, hosting capacity and a pre-screen for each.'),
      dict(eyebrow='Tuesday · Design', headline='Lay out the best two on satellite.', sub='Guided builds, with NFPA 855 separations checked as you draw.'),
      dict(eyebrow='Wednesday · Size', headline='Size the storage against the tariff.', sub='Every hour of the year, not the peak.'),
      dict(eyebrow='Thursday · Price', headline='Pull the one-line, the BOM and the estimate.', sub='From the same model. Send the RFQ from the BOM.'),
      dict(eyebrow='Friday · Finance', headline='Run the investment analysis. Send it to capital.', sub='The same numbers as the drawing.'),
      dict(eyebrow='Your move', headline='Ditch the stack.', sub='Comment BUILD and we\'ll build one of your sites live.', kicker='clearskyomega.com')])),

 dict(day=14, pillar='talk', fmt='Text', title='Why we built it (founder)',
  visual="A real photo of the founder on a site, if there is one. Post from the founder's own profile; the company page reshares.",
  text="""Why we built OMEGA.

We didn't start as a software company. We developed and built energy projects: storage, EV charging, microgrids, compute campuses.

Every project ran through the same pile of tools, and we spent more time re-keying numbers between them than making decisions. So we built the working book we wanted: one record from the parcel to the funded project.

Now any developer can work from it. If you want to see it on one of your own sites, send me an address.

[Founder: rewrite this in your own words before it goes out.]""",
  comment="", card=None),

 dict(day=15, pillar='drop', fmt='Image', title='Drop a Site: the one nobody wants',
  visual="The card. Results only, within 24 hours.",
  text="""Drop a Site: the one nobody wants.

Comment the site everyone told you wouldn't work. We'll screen the grid around the first 10 and reply with what's actually there.

Commercial and industrial sites only.

#EnergyStorage #Interconnection #SolarDevelopment""",
  comment="",
  card=dict(kind='drop', eyebrow='Drop a Site · Monday', headline='Drop the site nobody wants.',
            sub='Comment an address or a ZIP. The first 10 get the grid picture around it.', prompt='Comment an address or ZIP')),

 dict(day=16, pillar='build', fmt='Video', title='Build Tuesday: a compute campus',
  visual="Best with a sandbox recording (the card is its cover).",
  text="""Build Tuesday: a compute campus.

Start with the load you want. OMEGA lays out the campus against what the grid will carry, shows the gap, and sizes the generation and storage that closes it. You know whether the site can hold the load before anyone signs anything.

Compute & Data Center is in limited trial. Want in? Say so in the comments.

#DataCenters #Interconnection #PoweredLand""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Build Tuesday', headline='A compute campus, from the load.', clock='GO',
            laps=['Parcel', 'Load ask', 'Grid ceiling', 'The gap', 'Generation + storage'], prompt='Want into the trial? Comment')),

 dict(day=17, pillar='quiz', fmt='Image', title='Spot the problem, round 2',
  visual="The card. Tomorrow's run posts the answer card as a comment.",
  text="""Spot the problem, round 2.

The fire truck needs to get in. Which unit is in its way?

Answer in the comments. Answer tomorrow.

#BESS #FireSafety #SiteDesign""",
  comment="",
  card=dict(kind='plan', variant='lane', eyebrow='Spot the problem · Wednesday', headline='Which unit blocks the truck?',
            prompt='Comment 1, 2, 3 or 4'),
  answer="""Answer: unit 3. It's parked in the fire access lane, and the AHJ will send it back. In OMEGA the fix is one drag: move the unit, and the trench, the conduit schedule and the estimate follow.""",
  answer_card=dict(kind='plan', variant='lane', flag=3, flagText='Unit 3: inside the fire access lane',
                   eyebrow='The answer', headline='Unit 3.')),

 dict(day=18, pillar='stack', fmt='Image', title='What one platform replaces',
  visual="The card.",
  text="""Ditch the stack: what one platform replaces.

Grid and hosting-capacity data → Grid Atlas
Site-screening consultant or GIS time → Site Intelligence
Battery-sizing and revenue spreadsheets → Storage Sizing & Revenue
CAD seat and outsourced drafting → Plan Sets & CAD
Estimating sheets and RFQs by email → Estimate, BOM & Procurement
The analyst-built pro forma → Investor & Finance
An asset-management platform → Operations

Add up what you pay for the left column today. That's the number to beat.

#EnergyStorage #SolarDevelopment #CleanEnergy""",
  comment="",
  card=dict(kind='list', eyebrow='Count Your Stack · Thursday', headline='What one platform replaces.',
            rows=[['Grid and hosting-capacity data', 'Grid Atlas'], ['Site-screening consultant, GIS time', 'Site Intelligence'],
                  ['Sizing and revenue spreadsheets', 'Storage Sizing & Revenue'], ['CAD seat, outsourced drafting', 'Plan Sets & CAD'],
                  ['Estimating sheets, RFQs by email', 'Estimate, BOM & Procurement'], ['The analyst-built pro forma', 'Investor & Finance'],
                  ['An asset-management platform', 'Operations']])),

 dict(day=19, pillar='speed', fmt='Image', title='Speedrun Friday: move it once',
  visual="Record the revision first (sandbox, clock on screen). Card at 8 AM, video at noon with the real time.",
  text="""Speedrun Friday: move it once.

Drag the battery 40 feet. Count what updates on its own: the trench re-routes, the conduit schedule re-counts, the estimate follows.

Guess how long the whole revision takes. Video at noon.

#BESS #Engineering #EPC""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Speedrun Friday', headline='One drag. Guess the time.', clock='?:??',
            laps=['Drag the battery', 'Trench re-routes', 'Schedule re-counts', 'Estimate follows'],
            prompt='Guess in the comments · video at noon')),

 dict(day=20, pillar='talk', fmt='Poll', title='Poll: what slows your pipeline?',
  visual="LinkedIn poll, one week. Options: Interconnection · Land and site control · Financing · Equipment and supply",
  text="""What slows your pipeline down most right now?""",
  comment="", card=None),

 dict(day=21, pillar='teach', fmt='Image', title='Model the year, not the peak',
  visual="The card.",
  text="""If your battery was sized to the peak, it was sized on one hour of the year.

A peak-shaving estimate is the worst hour of the month, multiplied out. OMEGA runs the system through all 8,760 hours instead: demand charges, time-of-use, capacity, the programs the site can enroll in, and the battery's own limits.

When the lender asks where a number came from, the answer is an hour of the year. Not a cell.

How was your last battery sized?

#EnergyStorage #ValueStack #BESS""",
  comment="",
  card=dict(kind='statement', eyebrow='Field Notes · Sunday', big='8,760', headline='Model the year, not the peak.',
            sub='Sized to the real load and tariff. Dispatched every hour. The pro forma reads from the dispatch.')),

 dict(day=22, pillar='drop', fmt='Image', title='Drop a Site: fleet depot edition',
  visual="The card. Results only, within 24 hours.",
  text="""Drop a Site: fleet depot edition.

Comment a depot, a truck stop or a lot where you'd put fast chargers. We'll screen the grid around the first 10 and reply with what's there.

Commercial and industrial sites only.

#EVCharging #FleetElectrification #DCFC""",
  comment="",
  card=dict(kind='drop', eyebrow='Drop a Site · fleet depot edition', headline="Drop a depot. We'll screen it.",
            sub='Comment an address or a ZIP. The first 10 get the grid picture around it.', prompt='Comment an address or ZIP')),

 dict(day=23, pillar='build', fmt='Video', title='Build Tuesday: solar + storage',
  visual="Best with a sandbox recording (the card is its cover).",
  text="""Build Tuesday: solar + storage.

Address in. The array laid out, the battery sized to the load and the tariff, the whole system dispatched across 8,760 hours, and a pro forma that reads from it.

What should we build next?

#SolarPlusStorage #EnergyStorage #CommercialSolar""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Build Tuesday', headline='Solar + storage, from an address.', clock='GO',
            laps=['Address', 'Solar + Storage build', 'Battery sized to the tariff', '8,760 dispatch', 'Pro forma'],
            prompt='What do we build next?')),

 dict(day=24, pillar='quiz', fmt='Image', title='What kills more battery projects?',
  visual="The card. Next week's run can share the tally from the comments.",
  text="""No right answer on this one. Tell us what you've lived.

What kills more battery projects?

A) Interconnection
B) Local permits
C) Financing
D) Equipment and supply

We'll share the tally next week.

#EnergyStorage #BESS #Interconnection""",
  comment="",
  card=dict(kind='quiz', eyebrow='Vote · Wednesday', headline='What kills more battery projects?',
            options=['Interconnection', 'Local permits', 'Financing', 'Equipment and supply'], prompt='Comment A, B, C or D')),

 dict(day=25, pillar='stack', fmt='Image', title='Five quotes, five call lists',
  visual="The card.",
  text="""Ask five vendors for a quote and you're on five call lists. For good.

The bill of materials in OMEGA writes itself as equipment lands on the drawing. When you're ready, send a request for quote to the vendors on it.

Each vendor sees only their own lines. Your company stays anonymous until you accept a quote.

How many vendors call you a week?

#Procurement #EnergyStorage #BESS""",
  comment="",
  card=dict(kind='statement', eyebrow='Count Your Stack · Thursday', headline='Get the quotes. Keep your number.',
            sub='Each vendor sees only their own lines. Your name appears when you accept a quote, not before.')),

 dict(day=26, pillar='speed', fmt='Image', title='Speedrun Friday: the full run',
  visual="Record the full run first (sandbox, clock on screen, one take). Card at 8 AM, video at noon with the real time.",
  text="""Speedrun Friday: the full run.

Address to a proposal a customer could sign: grid check, layout, sizing, one-line and estimate, proposal. One take, no cuts, clock on screen.

Guess the time. Closest guess gets a live build of their own site. Video at noon.

#BESS #EnergyStorage #ProjectDevelopment""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Speedrun Friday', headline='The full run. Guess our time.', clock='?:??',
            laps=['Grid check', 'Layout', 'Sizing', 'One-line + estimate', 'Proposal'], prompt='Guess in the comments · video at noon')),

 dict(day=27, pillar='board', fmt='Image', title='Site Leaderboard: 24 C&I sites',
  visual="The card (illustrative). Better: a real folder's ranking with the site names removed.",
  text="""24 C&I sites. One sitting. Here's the top of the board.

Every site ranked, every one with the grid picture alongside. The bottom of the list costs you nothing, because you never drive there.

Which would you visit first, and why?

(Sample sites, illustrative scores.)

#SiteSelection #EnergyStorage #CommercialSolar""",
  comment="",
  card=dict(kind='leaderboard', eyebrow='Site Leaderboard · Saturday', headline='24 sites. Who makes the cut?',
            note='Illustrative · sample sites',
            rows=[['Site 07', 94], ['Site 19', 90], ['Site 02', 83], ['Site 11', 77], ['Site 23', 62], ['Site 05', 49]],
            more='+ 18 more, ranked', prompt='Which one would you visit first?')),

 dict(day=28, pillar='teach', fmt='Image', title='What a lender looks for',
  visual="The card.",
  text="""What a lender looks for in a storage pro forma.

1. Revenue that ties back to an hourly dispatch, not a single peak.
2. Degradation, and the warranty that covers it, year by year.
3. Augmentation: when capacity gets added back and what it costs.
4. Every assumption stated, with its source.
5. A layout and an estimate that match the model.

OMEGA keeps the dispatch, the degradation, warranty and augmentation model, the layout and the estimate on one record.

What would you add?

#ProjectFinance #EnergyStorage""",
  comment="",
  card=dict(kind='list', eyebrow='Field Notes · Sunday', headline='What a lender looks for in a storage pro forma.',
            rows=[['1 · Revenue tied to an hourly dispatch'], ['2 · Degradation and its warranty, by year'], ['3 · Augmentation: when, and what it costs'],
                  ['4 · Every assumption, with its source'], ['5 · A layout and estimate that match the model']])),

 dict(day=29, pillar='drop', fmt='Image', title='Drop a Site: this time we build it',
  visual="The card. For the first 3 entries, build a layout in OMEGA and reply with a screenshot of the layout only.",
  text="""Four weeks of Drop a Site. One more round, and this time we build it.

Comment an address. The first 3 get a layout, not just a screen: the equipment placed, the separations checked, the site drawn.

Commercial and industrial sites only.

Ditch the stack.

#EnergyStorage #BESS #SiteDesign""",
  comment="",
  card=dict(kind='drop', eyebrow='Drop a Site · final round', headline='This time, we build it.',
            sub='Comment an address. The first 3 get a layout, not just a screen.', prompt='Comment an address')),

 dict(day=30, pillar='talk', fmt='Image', title='Live build (event)',
  visual="Create a LinkedIn Event or Live first; fill in the date and time in the text. The card is the cover.",
  text="""Live build, [DATE] at [TIME].

Drop an address in the comments, a real site or a public one. We'll pick three and build them live: grid check, layout, sizing and a first pro forma, in 30 minutes.

Register below.

#EnergyStorage #BESS #ProjectDevelopment""",
  comment="[Event link]",
  card=dict(kind='statement', eyebrow='Live', headline='Send an address. Watch it get built.',
            sub='Three sites, live: grid check, layout, sizing and a first pro forma in 30 minutes.', prompt='Register: link in the comments')),
]

SHEET_LETTER = {'drop': 'A', 'build': 'D', 'quiz': 'Q', 'stack': 'G', 'speed': 'S', 'board': 'R',
                'teach': 'T', 'talk': 'C', 'offer': 'P'}

VOICE = [
    'Engagement first. Every post asks for one small thing: a comment, a guess, a vote, an address, a score.',
    'The same seven series every week (Drop a Site, Build Tuesday, Guess & Spot, Count Your Stack, Speedrun Friday, Site Leaderboard, Field Notes), so people know what is coming and come back.',
    'First line under 12 words, a claim, a number or a challenge, strong enough to stop a scroll. Never "Excited to announce".',
    'Show speed, scale and ease; never the method. A real timer from a real recording, a real count of sites, the result on screen.',
    'No prices, plans, discounts or links to the price list. Pricing is for the call.',
    'Specific over clever: MW, feeders, NTP, COD, NFPA 855, the 8,760. Short lines. Three hashtags at most.',
    'Nothing invented: a number is from the product, a recording, a cited source, or labelled illustrative.',
]

NEWS_RULES = [
    'A timely post replaces the calendar post only for news from the last 72 hours that developers are discussing: interconnection rules (FERC, an ISO queue reform), a state storage or solar program, a battery permit fight or moratorium, an equipment price or tariff shock, a large-load announcement straining a grid.',
    'Verify the facts at the primary source or two independent reports; the source goes in the first comment.',
    'Shape: the news in one line, the take (what it changes about how a developer picks and proves a site), a question for the comments, then the one OMEGA capability that answers it.',
    'Never gloat about a company\'s loss, never name a prospect in a negative story, never tag a company to pitch it.',
    'Never move a series day (Drop a Site, Speedrun Friday) for news; post the news the next open day instead.',
]

ENGAGE = [
    'Answer every Drop a Site entry within 24 hours: run it in Grid Atlas and reply with results only (nearest substations and lines, published hosting capacity). Never explain how the screen works.',
    'Reply to every comment on the day\'s post. A reply that asks a question back doubles the thread.',
    'Everyone who comments BUILD or guesses closest gets a direct message offering a live build of their site.',
    'Comment on 3 posts from target accounts (docs/developer-targets.csv): a fact or a question, never a pitch.',
    'Invite 10–20 relevant connections to follow the page.',
]

PILLARS = {
    'drop': 'Drop a Site', 'build': 'Build Tuesday', 'quiz': 'Guess & Spot', 'stack': 'Count Your Stack',
    'speed': 'Speedrun Friday', 'board': 'Site Leaderboard', 'teach': 'Field Notes', 'talk': 'Conversation',
    'offer': 'Invitation',
}

ICP = [
    ('C&I / behind-the-meter storage developers and energy-as-a-service', 'Grid Atlas, Storage Sizing & Revenue, Investor & Finance'),
    ('Community solar + storage developers (IL, NY, NJ, MA, MD, MN, ME, CO)', 'Grid Atlas, Site Intelligence, Storage Sizing & Revenue'),
    ('Independent front-of-meter BESS developers (ERCOT, CAISO, PJM, MISO, NYISO, ISO-NE)', 'Grid Atlas, Site Intelligence, Investor & Finance'),
    ('EV fast-charging hub and fleet charging developers', 'Lite (DCFC build), Grid Atlas, Investor & Finance (DCFC pro forma)'),
    ('Microgrid and data-center power / powered-land developers', 'Compute & Data Center (limited trial), Grid Atlas, Site Intelligence'),
]

TITLES = 'Founder or CEO (under 30 people); VP or Director of Development; Head of Origination; Interconnection Manager; Development Manager; Project Finance lead'

SEQUENCE = [
    dict(when='Day 1', channel='LinkedIn', name='Connection request (under 300 characters)',
      text="""Hi {First}, I work with developers on siting and early-stage modelling. Saw {hook}. Would be good to connect."""),
    dict(when='Day 1', channel='Email', name='Email 1',
      subject='{Company} and {market} sites',
      text="""Hi {First},

Saw {hook}.

Most developers we talk to run a site through six or more tools before it reaches a lender: grid data, GIS, a sizing sheet, CAD, an estimate, a pro forma. ClearSky OMEGA does it on one record: grid headroom around the parcel, the layout on satellite, sizing against the tariff, the one-line and the BOM, and a pro forma that reconciles to an hourly dispatch.

Would a 20-minute session help, where we build one of your sites live from an address?

{Sender}
ClearSky OMEGA · {postal address}
Not the right person, or not interested? Reply "no" and I won't write again."""),
    dict(when='After they accept', channel='LinkedIn', name='DM 1',
      text="""Thanks for connecting, {First}. We built ClearSky OMEGA so a development team can screen, design, size, price and finance a site in one place instead of six tools. If it would help, I can build one of your sites live in 20 minutes from an address. Open to it?"""),
    dict(when='Day 4', channel='Email', name='Email 2 (reply in the same thread)',
      subject='Re: {Company} and {market} sites',
      text="""{First}, easier than a call: send me one of your sites (an address is enough) and I'll screen it before we talk. The grid picture around it, what fits on the parcel, a first layout. No prep on your side.

{Sender}
ClearSky OMEGA \u00b7 {postal address}
Reply "no" and I won't write again."""),
    dict(when='Day 8', channel='LinkedIn', name='DM 2',
      text="""{First}, we posted a short clip of a battery site going from an address to a one-line and a pro forma. Thought of your {market} work: {post link}"""),
    dict(when='Day 11', channel='Email', name='Email 3 (last)',
      subject='Re: {Company} and {market} sites',
      text="""Last note from me, {First}.

If screening and modelling sit with a consultant or a spreadsheet today, OMEGA gives your team a first answer on day one: is there grid room, what fits on the parcel, and what it could earn. That's before anyone pays for a study.

If the timing's wrong, no problem. The trial is here whenever it's useful: {trial}

{Sender}
ClearSky OMEGA · {postal address}"""),
]

HOOKS = [
    'A project announcement (MW, MWh, market, date)',
    'A new interconnection queue entry in a public ISO or utility queue',
    'A funding round, tax-equity close or new financing partner',
    'Entry into a new state or ISO',
    'A job post for GIS, interconnection or energy modelling (they are building the stack you replace)',
]

CADENCE = [
    ('Accounts per week', '20 new developer accounts, one named person each'),
    ('LinkedIn', '5 connection requests a day from the founder\'s own profile, with a note; comment on their posts before you pitch'),
    ('Email', 'The three-email sequence above, from a monitored clearsky-usa.com mailbox, drafted in Gmail and sent by a person'),
    ('Company page', 'One post a day from the calendar; the founder reshares each weekday post with a line of their own'),
    ('Tracking', 'Company, person, source, hook, stage, next step and date on one sheet (later: the prospects board in docs/SALES-AGENT.md §5)'),
]

METRICS = [
    ('Weekly', 'Comments per post, Drop a Site entries, guesses and votes, new followers, profile visits, BUILD requests, live builds booked, trial requests'),
    ('Monthly', 'Trials approved, trials that built a project, trials converted to paid, paid revenue added'),
    ('Starting targets (adjust after week 2)', '10+ comments on each series post, 5 live builds booked and 2 trial requests a week'),
]

# Sell the result, never the method.
GUARDRAILS_DO = [
    'Show outputs: a finished layout, a one-line, a headroom answer, a result chart, a price-list page.',
    'Take every screenshot and video in the sandbox (the sample workspace with invented data) or from the published guides.',
    'Show speed, scale and ease: a real timer from a real recording, a real count of sites, the finished layout or ranking on screen.',
    'Answer a Drop a Site entry with results only: distances, voltages, published hosting capacity.',
    'Say "beta", "limited trial" or "coming soon" wherever the product does.',
    'Run live demos in the sandbox, or inside a trial workspace after the prospect has accepted the terms at sign-in. Those terms forbid reverse engineering and using the platform to build a competing product.',
    'Keep deep technical diligence (how a model works, what data sits behind it) for a signed NDA.',
]
GUARDRAILS_DONT = [
    "Show inputs, formulas, weights or assumption tables: scoring, dispatch, value-stack math, cost bands, unit rates, eligibility rules. They run on the server so nobody can read them, so don't put them in a screenshot either.",
    "Show a real customer's workspace, project, address, bill or equipment list.",
    'Name or show the logo of a customer without their written permission. Accounts under a signed agreement (the off-limits list in docs/SALES-AGENT.md \u00a75) and anyone mid-negotiation are never named.',
    'Name data vendors, financing partners, the architecture, the database, internal tools or internal codenames.',
    'Claim what does not ship. The AHJ portal, the procurement marketplace, aggregators and offtakers are coming soon. Site Finder covers northern Illinois (ComEd) only. The Permitting Matrix is beta and verified jurisdiction by jurisdiction. Compute is in limited trial.',
    'Invent numbers: no hours saved, times, customer counts or savings unless they come from the product, a recording or a clearly labelled example.',
    'Post a price, a plan, a discount, or a link to the price list or the signup page. Pricing is for the call (founder decision, 2026-09-27).',
    'Show how a ranking or a score is made: the factors, their weights, the data sources behind them. Show the rank and the result.',
]

BLOCKERS = [
    ('Fix the website contact before sending anyone there.',
     "The footer on www.clearskyomega.com still lists an info@ address on the retired legacy domain, and \"Request a demo\" should reach a clearsky-usa.com inbox somebody reads. The site also lists an AHJ Approval Portal, which the product marks coming soon. Bring the site in line with what ships."),
    ('Know where prices still show.',
     'The posts no longer mention or link to prices, but the public price list (silmarillion.clearskyomega.com/offerings) and the package step of signup still show them to anyone who finds them. Hiding them is a product change: say if you want it. Card payment at signup is also still switched off in production.'),
    ('Approve signups the same day.',
     'The growth board (GET /api/growth) flags a signup waiting a day or more. A campaign that drives signups needs someone approving them daily.'),
    ('Pick the posting channel.',
     'There is no LinkedIn connector in this session. Connect a scheduler that posts to LinkedIn company pages (Typefully or Metricool are in the connector directory; check that it supports company pages) and a daily routine can queue each post for approval. Without one, the routine can put each day\'s post in Gmail drafts to paste by hand.'),
    ('Pick the sender and the postal address.',
     "Cold email needs a monitored clearsky-usa.com mailbox (docs/SALES-AGENT.md §10, decision 1) and a real postal address in every message. Never send cold email from a personal gmail.com address."),
    ('Confirm the page facts.',
     'Legal entity, headquarters (the website footer says Clinton, Iowa), company size, logo and banner.'),
]

ROUTINE_PROMPT = """Daily LinkedIn post for ClearSky OMEGA. Read CLAUDE.md and docs/GO-TO-MARKET.md (the guardrails, the voice and the news rules). 1) Today's calendar day: day 1 is [START DATE], one post a day. 2) Search the last 72 hours of energy-development news. If something clears the news rules, write a timely post in the voice instead of the calendar post, with its source for the first comment and a card spec in the same shape as content.py; otherwise take the calendar post and sharpen its first line if you can. 3) Check it against the guardrails and the list of what does not ship; say what you changed. 4) Render the graphic: python3 scripts/marketing/build.py <out>, then node scripts/marketing/card.js <out>/cards.json <out> <dayNN> (a timely post: a one-card JSON of your own). 5) Deliver it ready to paste: the graphic (and the PDF for a carousel), the post, the first comment and today's engagement list. With a scheduler connected, queue it there as a draft for approval instead. Never publish without the founder's approval. 6) Mondays: last week's numbers if the scheduler reports them, and what to do more of. After day 30, write the next week in the same pillars and voice and ask before using it."""
