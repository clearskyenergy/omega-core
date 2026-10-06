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
  text="""Drop an address in the comments. We'll screen the grid around it.

That's the game, every Monday from today. The first 10 commercial or industrial sites get a reply with what we find: the nearest substations and lines, and the hosting capacity where the utility publishes it.

Why? We built ClearSky OMEGA so a developer can screen, lay out and estimate an energy site in one place instead of eight tools. Talk is cheap. Let's play.

No sign-up, no catch. Drop a site.

#EnergyStorage #Interconnection #BESS""",
  comment="Want your whole pipeline screened, not one site? Comment BUILD or send us a message and we'll set up a live build.",
  card=dict(kind='drop', eyebrow='Drop a Site · every Monday', headline="Drop a site. We'll screen it.",
            sub='Comment an address or a ZIP. The first 10 get the grid picture around it, in the replies.',
            prompt='Comment an address or ZIP')),

 dict(day=2, pillar='build', fmt='Video', title='Build Tuesday: a battery site',
  visual="Best with a 30–60 s sandbox recording of exactly these steps (the card is its cover). Without a recording, post the card.",
  text="""Type an address. Pick BESS Build. Watch the site lay itself out.

The battery, transformer, switchgear and meter snap into place along the trench runs to the point of interconnection, with NFPA 855 and IFC 1207 separations checked while it draws. Then the one-line and the bill of materials, from the same model.

No re-keying. No waiting on a drafter for the concept.

That's Build Tuesday. What should we build next week: an EV hub, solar + storage, or a data center? Vote in the comments.

#BESS #EnergyStorage #SiteDesign""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Build Tuesday', headline='Type an address. Watch it build.', clock='GO',
            laps=['Address', 'BESS Build', 'Layout, NFPA 855 checked', 'One-line', 'Bill of materials'],
            prompt='Vote: what do we build next week?')),

 dict(day=3, pillar='quiz', fmt='Image', title='Spot the problem',
  visual="The card. Tomorrow's run posts the answer card as a comment on this post.",
  text="""One of these four battery units gets the whole layout sent back by the fire marshal. Which one?

Spot the problem, and tell us why. Answer in the comments; we'll post the answer tomorrow.

#BESS #NFPA855 #FireSafety""",
  comment="",
  card=dict(kind='plan', variant='building', eyebrow='Spot the problem · Wednesday', headline='Which unit gets rejected?',
            prompt='Comment 1, 2, 3 or 4, and why'),
  answer="""Answer: unit 1. It sits closer to the existing building than the fire code allows (NFPA 855 and IFC 1207 set the separations; your AHJ has the final word). In OMEGA the separations are checked the moment you place a unit, so it never reaches the fire marshal.""",
  answer_card=dict(kind='plan', variant='building', flag=1, flagText='Unit 1: too close to the building',
                   eyebrow='The answer', headline='Unit 1.')),

 dict(day=4, pillar='stack', fmt='Image', title='Count your stack',
  visual="The card.",
  text="""How many tools does one of your projects pass through before NTP? Count them:

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
  text="""How long does it take to go from an address to a battery layout, sized, with a proposal? Guess.

Speedrun Friday: one take, clock on screen, no cuts. Put your guess in the comments before you watch.

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
  text="""Type an address. Pick DCFC Build. Watch a fast-charging hub lay itself out.

The fast-charging bank, the AC distribution and a battery for demand management land on the site, and a DCFC pro forma fills in: utilization, IRR, payback.

Add more storage to shave the demand charge and watch the payback move.

That's Build Tuesday. What should we build next week?

#EVCharging #DCFC #EVInfrastructure""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Build Tuesday', headline='An EV hub, from an address.', clock='GO',
            laps=['Address', 'DCFC Build', 'Load vs. grid', 'DCFC pro forma', 'Add storage'], prompt='What do we build next week?')),

 dict(day=10, pillar='quiz', fmt='Image', title='Quiz: what will a lender finance?',
  visual="The card. Tomorrow's run sends the answer to post as a comment.",
  text="""Quiz. Which of these will a lender actually finance?

A) A waitlist
B) A deck that says "coming soon"
C) A pro forma that ties back to an hourly dispatch
D) A screenshot of a hosting capacity map

Answer in the comments. We'll post the answer tomorrow.

#ProjectFinance #EnergyStorage #Bankability""",
  comment="",
  card=dict(kind='quiz', eyebrow='Quiz · Wednesday', headline='Which one will a lender finance?',
            options=['A waitlist', 'A "coming soon" deck', 'A pro forma tied to an hourly dispatch', 'A hosting map screenshot'],
            prompt='Comment A, B, C or D'),
  answer="""Answer: C. A lender finances numbers it can trace: revenue tied to an hourly dispatch, a layout that matches the estimate, a site that clears the grid and the fire code. A waitlist has none of that. Neither does a screenshot."""),
 dict(day=11, pillar='already', fmt='Image', title='Already at the party',
  visual="The card. Make fun of the waitlist, never of a company: no names, logos or screenshots of anyone else's product.",
  text="""Every month another energy software startup opens a waitlist.

Join to be notified. Be first in line. Early access, coming soon.

Meanwhile, at the party: the grid around the parcel, the layout on satellite with NFPA 855 checked as you draw, the storage sized against the tariff over 8,760 hours, the one-line, the bill of materials, the pro forma and the financing application. On one record, working today.

We didn't build a waitlist. We built the thing.

What's the longest waitlist you've ever been stuck on?

#EnergyStorage #ProjectDevelopment #CleanEnergy""",
  comment="",
  card=dict(kind='guestlist', eyebrow='Already There · Thursday', headline="Everyone's on the waitlist. We're at the party.",
            waitlist=['"Join for early access"', '"Be first in line"', '"Coming soon"', '"Demo video only"'],
            inside=['Grid screening', 'Layout, NFPA 855 checked', 'Sizing over 8,760 hours', 'One-line + BOM', 'Pro forma + financing'],
            prompt='Longest waitlist you were stuck on?')),
 dict(day=12, pillar='speed', fmt='Image', title='Speedrun Friday: 10 sites',
  visual="Record the run first (sandbox or a real folder with the names removed, clock on screen, one take). Card at 8 AM, video at noon with the real time. The agent leaves this one as a draft for the video.",
  text="""10 sites, screened and ranked, on a real clock. Not a waitlist. Not a demo reel.

One folder of KMZs in, a ranked list out, then layouts on the top three. One take, clock on screen.

Guess the time before the video drops at noon. Closest guess gets a live build of their own site.

#SiteSelection #EnergyStorage #SolarDevelopment""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Speedrun Friday', headline='10 sites. Guess our time.', clock='?:??',
            laps=['Load 10 KMZs', 'Grid picture', 'Terrain + buildable area', 'Rank', 'Top 3 layouts'],
            prompt='Guess in the comments \u00b7 video at noon')),
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
      dict(eyebrow='Your move', headline='Not a waitlist. A week.', sub='Comment BUILD and we\'ll build one of your sites live.', kicker='clearskyomega.com')])),

 dict(day=14, pillar='talk', fmt='Text', title='Why we built it (founder)',
  visual="A real photo of the founder on a site, if there is one. Post from the founder's own profile; the company page reshares.",
  text="""Why we built OMEGA.

We didn't start as a software company. We developed and built energy projects: storage, EV charging, microgrids, compute campuses.

Every project ran through the same pile of tools, and we spent more time re-keying numbers between them than making decisions. So we built the working book we wanted: one record from the parcel to the funded project.

Now any developer can work from it. If you want to see it on one of your own sites, send me an address.

[Founder: rewrite this in your own words before it goes out.]""",
  comment="", card=None),

 dict(day=15, pillar='drop', fmt='Image', title='Drop a Site: feasibility edition',
  visual="The card. Results only, within 24 hours.",
  text="""Drop the site you're about to option. We'll tell you what the grid says first.

Comment an address or a ZIP. The first 10 get the nearest substations and lines, plus the hosting capacity where the utility publishes it, before you spend a dollar on the land.

Commercial and industrial sites only.

Feasibility starts with the grid, not the lease.

#EnergyStorage #Interconnection #SolarDevelopment""",
  comment="",
  card=dict(kind='drop', eyebrow='Drop a Site \u00b7 feasibility edition', headline='Drop it before you option it.',
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

 dict(day=18, pillar='already', fmt='Image', title="You can't put a waitlist in a data room",
  visual="The card.",
  text="""You can't put a waitlist in a data room.

A lender wants evidence: the grid around the site, a layout that clears the fire code, storage sized against an hourly dispatch, an estimate that matches the drawing, and a model that reads from all of it.

OMEGA builds that evidence on one record. Not early access. Not coming soon. Today.

What's the first thing your lender asks for?

#ProjectFinance #EnergyStorage #Bankability""",
  comment="",
  card=dict(kind='statement', eyebrow='Already There \u00b7 Thursday', headline="You can't put a waitlist in a data room.",
            sub='Grid evidence, a code-clean layout, sizing over 8,760 hours, an estimate that matches the drawing, a model that reads from it. One record, today.',
            prompt='What does your lender ask for first?')),
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

 dict(day=20, pillar='already', fmt='Poll', title='Poll: waitlist inbox',
  visual="LinkedIn poll, one week. Options: 0 \u00b7 1\u20132 \u00b7 3\u20135 \u00b7 I've lost count",
  text="""Honest count: how many "you're on the waitlist!" emails from energy software are sitting in your inbox right now?""",
  comment="", card=None),
 dict(day=21, pillar='teach', fmt='Image', title='Feasible is not bankable',
  visual="The card.",
  text="""Feasible and bankable are not the same word.

Feasible: the grid can take it, the land can hold it, the fire code allows it.

Bankable: a lender believes the numbers. Revenue that ties to an hourly dispatch. Costs that match the drawing. Degradation and warranty, year by year. A source for every assumption.

Most tools stop at feasible, or never get past the waitlist. OMEGA carries a site from one to the other on the same record.

Which one kills more of your deals?

#ProjectFinance #EnergyStorage #Bankability""",
  comment="",
  card=dict(kind='compare', eyebrow='Bankable \u00b7 Sunday', headline='Feasible is not bankable.',
            cols=[dict(title='Feasible', items=['The grid can take it', 'The land can hold it', 'The fire code allows it']),
                  dict(title='Bankable', items=['Revenue tied to an hourly dispatch', 'Costs that match the drawing', 'Degradation and warranty by year'])])),
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

 dict(day=25, pillar='already', fmt='Image', title="Coming soon is not a feasibility study",
  visual="The card.",
  text=""""Coming soon" is not a feasibility study.

You can't option land on a roadmap. You can't take a teaser video to the utility. You can't ask a lender to finance early access.

What you can do today in OMEGA: screen the grid around a parcel, lay out the site with the fire code checked, size the storage over 8,760 hours, pull the one-line and the bill of materials, run the pro forma, and send a request for quote to the vendors on the BOM without handing them your phone number.

The party started a while ago. Come in.

#EnergyStorage #ProjectDevelopment #Bankability""",
  comment="",
  card=dict(kind='statement', eyebrow='Already There \u00b7 Thursday', big='SOON', strike=True,
            headline='Not a feasibility study.', sub="You can't option land on a roadmap. Screen, lay out, size, price and model it today, on one record.",
            prompt='Come in. The party started.')),
 dict(day=26, pillar='speed', fmt='Image', title='Speedrun Friday: the full run',
  visual="Record the full run first (sandbox, clock on screen, one take). Card at 8 AM, video at noon with the real time. The agent leaves this one as a draft for the video.",
  text="""Waitlists don't come with a stopwatch. This does.

Address to a proposal a customer could sign: grid check, layout, sizing, one-line and estimate, proposal. One take, no cuts, clock on screen.

Guess the time. Closest guess gets a live build of their own site. Video at noon.

#BESS #EnergyStorage #ProjectDevelopment""",
  comment="",
  card=dict(kind='stopwatch', eyebrow='Speedrun Friday', headline='The full run. Guess our time.', clock='?:??',
            laps=['Grid check', 'Layout', 'Sizing', 'One-line + estimate', 'Proposal'], prompt='Guess in the comments \u00b7 video at noon')),
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
  card=dict(kind='list', eyebrow='Bankable · Sunday', headline='What a lender looks for in a storage pro forma.',
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
  visual="Create a LinkedIn Event or Live first; fill in the date and time in the text. The card is the cover. A draft until the founder fills the date.",
  text="""Live build, [DATE] at [TIME]. No waitlist, no slides.

Drop an address in the comments, a real site or a public one. We'll pick three and build them live: grid check, layout, sizing and a first pro forma, in 30 minutes.

Register below.

#EnergyStorage #BESS #ProjectDevelopment""",
  comment="[Event link]",
  card=dict(kind='statement', eyebrow='Live', headline='No waitlist. No slides. Send an address.',
            sub='Three sites, live: grid check, layout, sizing and a first pro forma in 30 minutes.', prompt='Register: link in the comments')),
]

SHEET_LETTER = {'already': 'W', 'drop': 'A', 'build': 'D', 'quiz': 'Q', 'stack': 'G', 'speed': 'S', 'board': 'R',
                'teach': 'T', 'talk': 'C', 'offer': 'P'}

VOICE = [
    'Engagement first. Every post asks for one small thing: a comment, a guess, a vote, an address, a score.',
    'The same seven series every week (Drop a Site, Build Tuesday, Guess & Spot, Count Your Stack, Speedrun Friday, Site Leaderboard, Field Notes), so people know what is coming and come back.',
    'First line under 12 words, a claim, a number or a challenge, strong enough to stop a scroll. Never "Excited to announce".',
    'Show speed, scale and ease; never the method. A real timer from a real recording, a real count of sites, the result on screen.',
    'No prices, plans, discounts or links to the price list. Pricing is for the call.',
    'Bankability and feasibility are the spine (founder direction 2026-10-06): feasible means the grid, the land and the fire code allow it; bankable means a lender believes the numbers. Say which one a post is about.',
    'Already There (Thursdays) makes fun of the waitlist habit, never of a company: no names, logos or screenshots of anyone else. Every jab is paired with something OMEGA does today, in the product\'s own words. Never call live what the product marks beta, limited trial or coming soon (the AHJ portal and procurement marketplace are coming soon; Compute is a limited trial).',
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
    'Answer every Drop a Site entry within 24 hours: run it in Grid Atlas and reply with results only (nearest substations and lines, published hosting capacity). Paste the results to the daily run and it sends back a "Site screened" card per entry to reply with. Never explain how the screen works, and never name the entrant\'s site more precisely than they did.',
    'Reply to every comment on the day\'s post. A reply that asks a question back doubles the thread.',
    'Everyone who comments BUILD or guesses closest gets a direct message offering a live build of their site.',
    'Comment on 3 posts from target accounts (docs/developer-targets.csv): a fact or a question, never a pitch.',
    'Invite 10–20 relevant connections to follow the page.',
]

# The Drop a Site reply card. The founder runs each entry in Grid Atlas and
# pastes what it shows; the daily run renders one card per entry. Every value
# comes from the tool; nothing is estimated. tone: go | maybe | no.
REPLY_CARD_EXAMPLE = dict(kind='result', entry='#3', headline='Near [town], [state]',
    rows=[['Nearest substation', '[distance] · [kV]'], ['Lines nearby', '[count] within [distance]'],
          ['Published hosting capacity', '[value or "not published"]'], ['Parcel', '[acres]']],
    verdict='Worth a closer look', tone='go')

# The screen recordings behind Build Tuesday and Speedrun Friday. Button
# names are the editor's own (Build, Estimate and Output tabs). A person
# records; nothing here is generated. Build Tuesday may be trimmed; a
# Speedrun is one take with a clock on screen, and its time is only ever the
# real one.
RECORDING_SETUP = [
    'Record on a computer, not a phone: macOS Shift-Command-5, "Record Selected Portion", around the browser window only.',
    'Browser full screen (Control-Command-F) so the address bar, bookmarks and other tabs are off camera. Notifications off.',
    'A fresh project in your own workspace, on a real commercial or industrial address you are free to show (never a customer\'s site or a site under negotiation).',
    'For a Speedrun, open the Clock app\'s stopwatch in a small window inside the recorded area and start it on camera. One take, no cuts.',
    'Post the video with its card as the thumbnail, and one line of on-screen text or captions: most people watch muted.',
]
RECORDING_NEVER = [
    'The inputs and assumptions panels (BESS Sizer inputs, value-stack settings, pro forma assumptions): show the result screen only.',
    'Unit costs and rate columns in the estimate or BOM: show quantities, or the total for a second, never the rates.',
    'The Output tab\'s API Keys and AI Tokens panels, Settings, the console, or your project list (it names customers).',
    'The address bar, any other company\'s name or data, and any email or chat window.',
]
RECORDINGS = [
    dict(days='2', name='BESS build', length='30–60 s, trimmed', steps=[
        'Build tab → 1 · Site → Site Setup: type the address, lock the map.',
        '2 · Build → BESS Build: place the battery; the trench snaps BESS → transformer → switchgear → meter → POI.',
        'Pause on the separation check (NFPA 855) for two seconds.',
        'Output tab → One-Line: the one-line appears from the same model.',
        'Estimate tab → BOM: two seconds on the quantities.']),
    dict(days='5', name='Speedrun: address to proposal', length='one take, clock on screen', steps=[
        'Start the stopwatch on camera.',
        'Site Setup: the address.',
        'Grid Atlas: the substations and lines around the site (crop nothing, but do not open data-source panels).',
        'BESS Build: the layout.',
        '3 · Size & Configure → BESS Sizer: go straight to the result screen.',
        'Output tab → Proposal. Stop the clock. Post the real time.']),
    dict(days='9', name='EV fast-charging hub', length='30–60 s, trimmed', steps=[
        'Site Setup: a lot or a depot.',
        'Build tab → DCFC: the chargers, switchgear and transformer land.',
        'The load checked against what the grid can serve.',
        'The DCFC pro forma result: utilization, IRR, payback. The result, not the inputs.']),
    dict(days='12', name='Speedrun: 10 sites ranked', length='one take, clock on screen', steps=[
        'Start the stopwatch.',
        'Load a folder of 10 site KMZs into the parcel screening register (your own pipeline with the names changed, or public sample parcels).',
        'The ranked list appears. Show the rank and the score, never the factors or weights behind it.',
        'Open the top 3 and lay out the first one. Stop the clock.']),
    dict(days='16', name='Compute campus', length='30–60 s, trimmed', steps=[
        'Compute tab → Compute Build on a large parcel.',
        'The load asked for against what the grid will carry: the gap.',
        'The generation and storage that close it. Say on screen that Compute is in limited trial.']),
    dict(days='19', name='Speedrun: move it once', length='one take, clock on screen', steps=[
        'Start the stopwatch on a finished BESS layout.',
        'Select the battery and drag it about 40 feet.',
        'The trench re-routes; the conduit schedule re-counts; the estimate total updates. Stop the clock.']),
    dict(days='23', name='Solar + storage', length='30–60 s, trimmed', steps=[
        'Site Setup: a C&I roof or ground site.',
        'Build tab → Solar + Storage: the single-pass flow from the POI to the array.',
        'Solar → BESS Sizer: the battery sized to what was drawn. Result screen only.',
        'The pro forma result.']),
    dict(days='26', name='Speedrun rematch: the full run', length='one take, clock on screen', steps=[
        'The day-5 run again, plus the one-line and the estimate, after a month of practice.',
        'Say on screen whether you beat the day-5 time. Post the real time either way.']),
]

PILLARS = {
    'already': 'Already There', 'drop': 'Drop a Site', 'build': 'Build Tuesday', 'quiz': 'Guess & Spot', 'stack': 'Count Your Stack',
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

# Two more audiences beside the developers: the small shops that need basic
# design and estimating, and the big organizations that may already have
# tools. Nothing here is sent by code; a person sends every message and
# invite from their own LinkedIn (Premium) and mailbox.
PLAYBOOKS = [
 dict(key='small', sheet='S-303', name='Small shops',
  headline='Small shops: a design and estimating department in a browser',
  who='Commercial solar, storage and EV installers, small EPCs and electrical contractors, about 3 to 100 people, where the owner, a PM or one estimator does layouts and estimates by hand, in spreadsheets and CAD, one job at a time.',
  signal='Best signal: a current job post for a solar designer, PV designer, CAD drafter, estimator or pre-construction role. They are paying to build what OMEGA does. Next best: a utility or state approved-contractor list, a new C&I project, a new office.',
  pitch='Type an address, pick the build, and OMEGA places the equipment, checks the fire-code separations, draws the one-line and writes the bill of materials and the estimate. A small team designs and quotes like a big one.',
  offer='Send an address from a job you are quoting now and we build it live with you in 20 minutes. Then 14 days on your own jobs. Pricing on the call.',
  search=[
      ('Jobs (the hiring signal)', 'Jobs search, past month: "solar designer" OR "PV designer" OR "solar estimator" OR "CAD drafter" solar OR "pre-construction" solar. Every company that comes back is a lead.'),
      ('People', 'Titles: Owner, President, Operations Manager, Estimating Manager, Estimator, Project Manager, Director of Pre-construction. Keywords: solar OR "energy storage" OR "EV charging". Company size 2–50 and 51–200. Your states first.'),
      ('Companies', 'Industries: Solar Electric Power Generation, Renewable Energy Power Generation, Electrical contractors (Specialty Trade Contractors). Size 2–200.'),
  ],
  sequence=[
      dict(when='Day 1', channel='LinkedIn', name='Connection request (under 300 characters)',
           text="""Hi {First}, saw {Company} is growing its design and estimating side. We built a tool that does the layout, the one-line and the estimate from an address, so a small team can quote like a big one. Would be good to connect."""),
      dict(when='After they accept', channel='LinkedIn', name='DM',
           text="""Thanks for connecting, {First}. Most shops your size do layouts and estimates one job at a time, in spreadsheets and CAD. OMEGA does the layout, the one-line, the bill of materials and the estimate from an address, in one place. Send me an address from a job you're quoting and I'll build it live with you in 20 minutes. Worth a look?"""),
      dict(when='Not connected', channel='InMail', name='InMail (Premium credit)', subject='Your next {solar / battery / EV} layout',
           text="""{First}, saw {hook}.

If your team does layouts and estimates by hand, here's a faster way: type an address, pick the build, and OMEGA places the equipment, checks the fire-code separations, draws the one-line and writes the bill of materials and the estimate.

Send me an address from a job you're quoting and I'll build it with you live in 20 minutes. No prep on your side.

{Sender}, ClearSky OMEGA"""),
      dict(when='A week later', channel='LinkedIn', name='Follow-up',
           text="""{First}, one more idea: this week's Build Tuesday post shows a {build} going from an address to a layout. If you'd rather see it on one of your own jobs, the offer stands: one address, 20 minutes. {post link}"""),
  ],
  guard=[
      'Their job post is public, so it is fair to mention; never mention anything you learned any other way.',
      'Build their site live in your own workspace; never send them a file of it before they have a workspace and have accepted the terms.',
  ]),
 dict(key='enterprise', sheet='S-304', name='Big organizations',
  headline='Big organizations: find the team their tools miss',
  who='Large developers and IPPs with a distributed, C&I or community-solar arm; large EPCs with a solar, storage or EV practice; utility DER and EV programs; battery OEMs and integrators with a dealer or installer channel.',
  signal='Most have tools already. Do not pitch a replacement. Find the smaller team the big tools do not serve: DG or C&I origination screening dozens of small sites, a regional office, an interconnection team, or a channel of installers who need to quote the company\'s product.',
  pitch='OMEGA runs alongside the tools they have: dozens of small sites screened and laid out fast enough to make small projects worth doing, proposals for field sales, and a white-labelled version for their installer network.',
  offer='A 30-minute session on a handful of their own sites (under NDA if they bring their data), then a scoped pilot: one team, one region, 90 days, written up before it starts. Pricing on the call.',
  search=[
      ('Companies', 'Company size 1,001+ (and 501–1,000) in Renewable Energy Power Generation, Utilities and Construction; or upload the enterprise list as a company list.'),
      ('People (the entry team, not the C-suite)', 'Titles: Director or VP of Distributed Generation, C&I Origination, Community Solar Development, Interconnection Manager, Channel Partner or Dealer Program Manager, Regional Development Director.'),
      ('Signals', 'A new DG or C&I team, a state or utility program win, a channel or dealer program launch, job posts for GIS analysts or solar designers in a regional office.'),
  ],
  discovery=[
      'How long from a site lead to a first layout with an estimate, and who does it?',
      'How many sites does origination screen a month, and how many get a real look?',
      'Where do numbers get re-keyed between origination, engineering and finance?',
      'What do your installers or channel partners use to quote your product?',
      'Which projects are too small to be worth your current process?',
  ],
  sequence=[
      dict(when='Day 1', channel='LinkedIn', name='Connection request (under 300 characters)',
           text="""Hi {First}, I work with development teams on early-stage screening and design. Saw {hook}. Would be good to connect."""),
      dict(when='After they accept', channel='LinkedIn', name='DM: a question, not a pitch',
           text="""{First}, a question rather than a pitch: when your team gets a batch of small C&I or DG sites, how long does it take to get from a list to a first layout with an estimate? We built OMEGA for exactly that stretch, and it runs alongside the tools you already have. If it's useful, I can show it on a handful of your sites, under NDA if you'd rather."""),
      dict(when='For an OEM or integrator', channel='LinkedIn', name='DM: the channel angle',
           text="""{First}, how do your installers quote your systems today? We run a version of OMEGA under a manufacturer's own name, so its dealers size, lay out and quote the product the same way every time. Happy to show you how that looks."""),
  ],
  guard=[
      'Check the risk column first. A company that sells design or screening software is a competitor: no demo, no trial, decline its signup at approval.',
      'Demo in the sandbox with invented data. How the model works and what data sits behind it is for a signed NDA only, and even then show outputs.',
      'No trial workspace without a named sponsor who has accepted the terms. A pilot is scoped (one team, one region, 90 days) and written up first.',
      'Never send exports of model internals or a screen of the admin console, and never name another customer.',
      'Several people per company is fine (origination, engineering, finance), one thread each; never a blast.',
  ]),
]

# Account plays: messages written for one company, from facts checked at the
# source on the date shown. Two people per company in the first week at
# most, one thread each. Never mention their tools or job posts, never
# price, and their own sites only under NDA.
ACCOUNT_PLAYS = [
 dict(company='EDPR NA Distributed Generation',
  facts='More than 70 MWp built in 2025; more than 400 MWp of solar and storage across 570+ active sites in 27 states; expanding into community solar in Illinois, Maine and Maryland; Fortune 100 clients across big tech, pharmaceutical, food and beverage, automotive and healthcare. Source: edprnadg.com, 2025 year in review, 2025-12-09 (checked 2026-09-27).',
  why='Multi-site corporate programs are a list of sites that all need a first answer at once, and new states mean new utilities and parcels nobody has screened.',
  personas=[
   dict(who='C&I origination: the Fortune 100 multi-site programs', find='Titles: Director or VP of C&I Origination, Business Development, Corporate Programs',
    messages=[
     dict(channel='LinkedIn', name='Connection request',
      text="""Hi {First}, saw EDPR NA DG's 2025 review: 570+ active sites in 27 states and Fortune 100 programs across tech, pharma and food. I work on screening many sites at once for teams like yours. Would be good to connect."""),
     dict(channel='LinkedIn', name='After they accept',
      text="""Thanks for connecting, {First}. A question rather than a pitch: when a corporate client hands your team 40 or 50 of their sites, how long does it take to get a first answer on each one?

We built ClearSky OMEGA for that stretch. It ranks a whole folder of sites at once with the grid around each one, then gives a first layout, and a storage sizing wherever you have the utility bill. It sits upstream of the engineering you already do.

If it's useful, I'll run a handful of sites from a public list, or yours under NDA, and walk you through the ranked result in 30 minutes."""),
     dict(channel='InMail', name='If not connected', subject='570 sites, and the next 50 from one client',
      text="""{First}, congratulations on a record 2025: more than 70 MWp built and 570+ active sites across 27 states.

One question from the outside: when a Fortune 100 client hands your team a list of their facilities, how long does it take to get a first answer on each one?

ClearSky OMEGA ranks a whole folder of sites at once with the grid around each one, then gives a first layout, and a storage sizing wherever you have the utility bill. It sits upstream of the engineering you already do, so your engineers only see the sites that pass.

Worth 30 minutes on a handful of sites? A public sample list, or yours under NDA.

{Sender}, ClearSky OMEGA"""),
    ]),
   dict(who='Community solar in the new states (Illinois, Maine, Maryland)', find='Titles: Development Manager or Director, Community Solar; Site Acquisition; with Illinois, Maine or Maryland in the headline or location',
    messages=[
     dict(channel='LinkedIn', name='Connection request',
      text="""Hi {First}, saw EDPR NA DG is expanding community solar into Illinois, Maine and Maryland. I work with development teams on screening new-market parcels against the grid early. Would be good to connect."""),
     dict(channel='LinkedIn', name='After they accept',
      text="""Thanks, {First}. New states mean new utilities, new hosting maps and a lot of parcels nobody has looked at yet. How is your team deciding which ones get a site visit in {state}?

ClearSky OMEGA puts the substations, lines and published hosting capacity beside every parcel and ranks a whole folder of sites at once, so the drive time goes to the ones that pass. In ComEd territory it also reads ComEd's own capacity data.

Happy to show it on a few public parcels in {state}, 30 minutes."""),
    ]),
  ]),
 dict(company='Nexamp',
  facts='Closed a $300 million aggregation securitization facility with Crédit Agricole CIB to finance community solar, commercial and industrial, and other distributed generation and storage assets across multiple regions. Source: nexamp.com, 2026-06-09 (checked 2026-09-27).',
  why='More capital means more sites to sort through, and Nexamp has a mature engineering stack: OMEGA belongs upstream of it (screening, first layouts, storage fit), never pitched as a replacement.',
  personas=[
   dict(who='Regional development and site origination', find='Titles: Development Manager or Director (regional), Director of Origination, Site Acquisition Manager',
    messages=[
     dict(channel='LinkedIn', name='Connection request',
      text="""Hi {First}, saw Nexamp's $300M facility with Crédit Agricole CIB. I work with development teams on the stretch before engineering: which sites deserve a real look. Would be good to connect."""),
     dict(channel='LinkedIn', name='After they accept',
      text="""Thanks for connecting, {First}. A question: before a site reaches your engineering team, how many does your team screen to find one worth the work?

ClearSky OMEGA sits in that stretch. It ranks a folder of candidate sites at once with the grid beside each one, then gives a first layout, and a storage sizing where you have the load data, for the sites that pass. Your engineering hours go to the survivors. It doesn't replace your design stack.

Worth 30 minutes on a few public parcels in one of your markets?"""),
     dict(channel='InMail', name='If not connected', subject='Before sites reach your engineers',
      text="""{First}, congratulations on the $300M facility with Crédit Agricole CIB. More capital usually means more sites to sort through.

How many does your team screen to find one worth engineering?

ClearSky OMEGA works upstream of your design tools. It ranks a whole folder of candidate sites with the grid around each one, then gives a first layout, and a storage sizing with an hourly dispatch where you have the load data, for the sites that pass. Your engineers only see the survivors.

30 minutes on a handful of parcels in one of your markets? Public ones, or yours under NDA.

{Sender}, ClearSky OMEGA"""),
    ]),
   dict(who='Interconnection', find='Titles: Interconnection Manager or Director, Grid Integration',
    messages=[
     dict(channel='LinkedIn', name='Connection request',
      text="""Hi {First}, I work with community solar teams on the early grid read: substations, lines and hosting capacity beside every parcel before an application goes in. Would be good to connect."""),
     dict(channel='LinkedIn', name='After they accept',
      text="""Thanks, {First}. Curious how your team decides which sites are worth an interconnection application.

ClearSky OMEGA puts the substations, lines and published hosting capacity beside each parcel and runs a pre-screen against the fast-track screens, so weak sites drop out before anyone pays for a study.

Would it help to see it on a few sites in one of your utilities?"""),
    ]),
  ]),
]
PLAY_FOLLOWUP = """{First}, one more thing that might be useful: our Speedrun Friday posts show a folder of sites screened and ranked in one take, clock on screen. {post link}

If you'd rather see it on your own list, the offer stands: 30 minutes, under NDA."""

ADS = [
    ('Budget', 'The page\'s ad credit, over about two weeks. Most of it on small shops; a small slice on a company-list audience.'),
    ('Small shops', 'Company size 2–200; industries Solar Electric Power Generation, Renewable Energy Power Generation and electrical contractors; titles Owner, President, Operations Manager, Estimator, Project Manager, Solar Designer; United States. Creative: the Build Tuesday or Score Your Stack card. Call to action: Follow.'),
    ('Company list', 'Upload the developer and enterprise lists as a company list (Matched Audiences). Show them Field Notes and Site Leaderboard posts, so the name is familiar before the first message.'),
    ('Developers', 'Titles VP or Director of Development, Development Manager, Interconnection Manager, Head of Origination, Founder or CEO; company size 11–500. Creative: the Drop a Site card.'),
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
    'Name, picture or link a competitor, its logo or its product, in a joke or anywhere else. The joke is the waitlist, not a company.',
]

BLOCKERS = [
    ('Fix the website contact before sending anyone there.',
     "The footer on www.clearskyomega.com still lists an info@ address on the retired legacy domain, and \"Request a demo\" should reach a clearsky-usa.com inbox somebody reads. The site also lists an AHJ Approval Portal, which the product marks coming soon: a page that mocks waitlists cannot advertise one. Bring the site in line with what ships."),
    ('Know where prices still show.',
     'The posts no longer mention or link to prices, but the public price list (silmarillion.clearskyomega.com/offerings) and the package step of signup still show them to anyone who finds them. Hiding them is a product change: say if you want it. Card payment at signup is also still switched off in production.'),
    ('Approve signups the same day.',
     'The growth board (GET /api/growth) flags a signup waiting a day or more. The posts now say "not a waitlist": a signup that waits days for approval makes that untrue. Approve the same day.'),
    ('Pick the posting channel.',
     'There is no LinkedIn connector in this session. Connect a scheduler that posts to LinkedIn company pages (Typefully or Metricool are in the connector directory; check that it supports company pages) and a daily routine can queue each post for approval. Without one, the routine can put each day\'s post in Gmail drafts to paste by hand.'),
    ('Pick the sender and the postal address.',
     "Cold email needs a monitored clearsky-usa.com mailbox (docs/SALES-AGENT.md §10, decision 1) and a real postal address in every message. Never send cold email from a personal gmail.com address."),
    ('Confirm the page facts.',
     'Legal entity, headquarters (the website footer says Clinton, Iowa), company size, logo and banner.'),
]

ROUTINE_PROMPT = """OMEGA Marketing Agent, daily run. In omega-core, git pull on branch claude/loving-planck-uyubl5, then follow docs/MARKETING-AGENT.md (what you may publish on your own and what stays a draft) and docs/GO-TO-MARKET.md (the voice, the news rules, the guardrails). Today's day = days since 2026-09-28 + 1. Deliver yesterday's quiz answer if there is one; check the last 72 hours of news; check the post; render its card; publish or draft it through Typefully per the rules; then report to the founder with the graphic, what was scheduled or drafted, the first comment if any, and today's ten minutes. Never email, never comment, message or invite on LinkedIn, never post a price."""
