/* ═══════════════════════════════════════════════════════════════════════════════
   /omega-legal-docs.js — the agreements a new account must sign
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   THIS FILE IS PURE TEXT. No logic lives here.
   ─────────────────────────────────────────────────────────────────────────────
   It exists so your attorney can redline the agreements without touching any
   code. Everything in [BRACKETS] is a decision you or counsel must make.

   IMPORTANT — VERSION
   Bump `version` whenever the wording changes. Every account that signed an
   older version is asked to sign again on their next visit, and the old
   signature record is kept intact. Never edit wording without bumping.

   NOT LEGAL ADVICE. This is a drafting starting point, not a lawyer's work
   product. Have an Iowa-licensed attorney review it before it gates a real
   customer.
   ═══════════════════════════════════════════════════════════════════════════════ */
window.OMEGA_LEGAL_DOCS = {

  /* Bump on ANY wording change. Format: YYYY-MM-DD (add -b, -c for same-day). */
  version: '2026-09-02',

  /* Company details used throughout both agreements. */
  company: {
    legalName: 'ClearSky Energy Solutions LLC',
    dba:       'ClearSky Builders LLC',
    platform:  'ClearSky-OMEGA',
    state:     'Iowa',
    county:    'Clinton County, Iowa',
    notice:    'dev@clearsky-usa.com'
  },

  docs: [

  /* ═══════════════════════════════════════════════════════════════════════════
     DOCUMENT 1 — PLATFORM TERMS OF SERVICE
     ═══════════════════════════════════════════════════════════════════════════ */
  {
    id:    'tos',
    title: 'Platform Terms of Service',
    sub:   'Governs your access to and use of the ClearSky-OMEGA platform.',
    consent: 'I have read the Platform Terms of Service and agree to be bound by them.',
    sections: [

      { h: '1. The agreement and the parties', p: [
        'This Platform Terms of Service ("Terms") is a binding contract between ClearSky Energy Solutions LLC, an Iowa limited liability company also operating as ClearSky Builders LLC ("ClearSky", "we", "us"), and the company or other legal entity on whose behalf you are creating this account ("Customer", "you"). If you are creating an account for yourself and not for an employer or client, "Customer" means you personally.',
        'These Terms take effect the moment you sign below, and govern every session, page, tool, export, and API call made under your account or any account you create.',
        'The Mutual Nondisclosure and Software Protection Agreement presented alongside these Terms is incorporated into this agreement by reference. Both must be signed before access is granted.'
      ]},

      { h: '2. Your authority to sign', p: [
        'By signing, you represent that you are at least 18 years old, that the name and entity you type below are accurate, and that you are authorized to bind that entity to this agreement. If it later turns out you were not authorized, you agree to be personally bound by these Terms.',
        'You further represent that the email address on the account is one you control and are entitled to use for business purposes.'
      ]},

      { h: '3. What you are granted', p: [
        'Subject to your continued compliance with this agreement, ClearSky grants Customer a limited, revocable, non-exclusive, non-transferable, non-sublicensable right for Customer\'s authorized personnel to access and use the hosted ClearSky-OMEGA platform, during the term, solely for Customer\'s own internal business purposes.',
        'That is the entire grant. You are being granted access to a hosted service. You are not being sold, licensed, assigned, or given the software itself, any copy of it, any source code, or any right to reproduce or reimplement it.',
        'Access is per named individual. Credentials may not be shared, pooled, sold, or used by more than one person. You are responsible for everything done under your credentials, including by anyone you give them to.'
      ]},

      { h: '4. What you may not do', p: [
        'You will not, and will not permit or assist anyone else to:',
        '(a) copy, save, download, extract, archive, scrape, harvest, or otherwise retain the platform\'s source code, markup, scripts, stylesheets, assets, configuration, or data structures, including any of the foregoing that your browser necessarily receives in order to render a page;',
        '(b) reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, architecture, algorithms, formulas, scoring methodologies, data models, or trade secrets embodied in the platform, except to the narrow extent that this restriction is unenforceable under applicable law;',
        '(c) build, fund, specify, or assist in building any product, tool, dataset, template, or service that replicates, competes with, or is derived from the platform or any part of it;',
        '(d) access the platform by any automated means, including crawlers, scripts, headless browsers, or AI agents, or attempt to circumvent any rate limit, authentication step, tenant boundary, or access control;',
        '(e) use the platform to train, fine-tune, evaluate, or ground any machine learning model, or submit its interfaces, outputs, or code to any third-party model or service for that purpose;',
        '(f) remove, obscure, or alter any copyright, trademark, watermark, tenant identifier, canary token, or other proprietary or tracking notice;',
        '(g) frame, mirror, white-label, resell, sublicense, rent, lease, or provide service-bureau access to the platform, or make it available to any third party;',
        '(h) publish benchmarks, performance data, screenshots, recordings, or descriptions of the platform\'s non-public functionality without ClearSky\'s prior written consent;',
        '(i) probe, scan, or test the vulnerability of the platform or its infrastructure, or breach or attempt to breach any security or authentication measure; or',
        '(j) use the platform in violation of any applicable law, or on behalf of any party barred from receiving U.S. exports.',
        'Each of the restrictions above is a material term. Breach of any of them is a material breach of this agreement.'
      ]},

      { h: '5. Who owns what', p: [
        'ClearSky and its licensors own all right, title, and interest in and to the platform and everything in it, including its source code, user interfaces, visual design, tool logic, calculation and scoring methodologies, incentive and tariff models, layer definitions, data schemas, documentation, and all intellectual property rights in them. Nothing in this agreement transfers any of it to you.',
        'ClearSky reserves all rights not expressly granted in Section 3.',
        'If you send us ideas, requests, bug reports, or suggestions ("Feedback"), you grant ClearSky a perpetual, irrevocable, worldwide, royalty-free right to use and commercialize that Feedback without restriction or compensation to you.'
      ]},

      { h: '6. Your data', p: [
        'You retain ownership of the project data, site information, files, and other content you enter into or upload to the platform ("Customer Data"). You grant ClearSky the right to host, store, process, transmit, back up, and display Customer Data as needed to operate the platform and provide support.',
        'You represent that you have the rights necessary to submit Customer Data and that it does not infringe anyone\'s rights or violate any law.',
        'ClearSky may generate and retain de-identified, aggregated statistics derived from platform usage. Such statistics never identify you, your customers, or your projects, and ClearSky may use them to operate and improve the platform.',
        'On request within thirty (30) days after termination, ClearSky will make Customer Data available for export in a commercially reasonable format. After that window, ClearSky may delete it.'
      ]},

      { h: '7. Outputs are estimates, not professional advice', p: [
        'The platform produces models, estimates, screenings, layouts, incentive calculations, capacity indications, and financial projections. All of them are informational. They depend on third-party data, published tariffs and program rules, and assumptions that change.',
        'Nothing the platform produces is engineering, architectural, legal, tax, accounting, investment, or utility interconnection advice, and none of it is a substitute for a stamped design, a signed interconnection study, a tax opinion, or an executed incentive award.',
        'You are solely responsible for independently verifying every output before relying on it, bidding from it, or presenting it to a third party. ClearSky is not liable for decisions made on the basis of platform outputs.'
      ]},

      { h: '8. Fees and evaluation access', p: [
        'Demonstration and evaluation access is provided at no charge, at ClearSky\'s discretion, and may be modified, suspended, or withdrawn at any time for any reason.',
        'Paid access is governed by the order form, subscription agreement, or written quote executed between the parties. Where that document conflicts with these Terms, that document controls as to fees, term, and scope of subscription. [COUNSEL: confirm order-of-precedence language matches your standard order form.]',
        'Fees are non-refundable except as expressly stated in the applicable order form.'
      ]},

      { h: '9. Availability and changes', p: [
        'ClearSky will use commercially reasonable efforts to keep the platform available, but does not commit to any uptime level unless a written service level agreement says otherwise. The platform depends on third-party infrastructure and public data sources, which may be unavailable, delayed, or withdrawn.',
        'ClearSky may add, change, deprecate, or remove features, tools, and data layers at any time. ClearSky may perform maintenance with or without notice.'
      ]},

      { h: '10. Monitoring, logging, and audit', p: [
        'You consent to ClearSky logging and monitoring account activity, including sign-ins, tool access, exports, downloads, API calls, IP addresses, and device information, for security, billing, abuse prevention, and enforcement of this agreement.',
        'ClearSky may embed unique identifiers, watermarks, and tracking markers in pages, exports, and generated files that identify the account they were produced under. You will not remove or alter them, and you agree they may be used as evidence of source in any dispute.',
        'On reasonable notice and no more than once per year (or at any time following a suspected breach), ClearSky may audit Customer\'s use of the platform to confirm compliance. You will cooperate reasonably with any such audit.'
      ]},

      { h: '11. Suspension', p: [
        'ClearSky may suspend or restrict access immediately, without notice and without liability, if it reasonably suspects a breach of Section 4, a compromise of credentials, a security threat, or any use that puts the platform, its data, or other customers at risk.'
      ]},

      { h: '12. Disclaimer of warranties', p: [
        'THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE". TO THE MAXIMUM EXTENT PERMITTED BY LAW, CLEARSKY DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED, AND STATUTORY, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, ACCURACY, AND NON-INFRINGEMENT.',
        'CLEARSKY DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, OR THAT ANY OUTPUT, ESTIMATE, DATASET, OR THIRD-PARTY DATA LAYER IS ACCURATE, CURRENT, OR COMPLETE.'
      ]},

      { h: '13. Limitation of liability', p: [
        'TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST REVENUE, LOST BUSINESS, LOST DATA, OR COST OF SUBSTITUTE SERVICES, EVEN IF ADVISED OF THE POSSIBILITY.',
        'CLEARSKY\'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT WILL NOT EXCEED THE GREATER OF (a) THE FEES CUSTOMER PAID TO CLEARSKY IN THE TWELVE (12) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (b) ONE HUNDRED U.S. DOLLARS ($100). [COUNSEL: confirm the floor amount and whether a higher cap applies to paid tiers.]',
        'These limits do not apply to: Customer\'s breach of Section 4 (restrictions), either party\'s breach of the Mutual Nondisclosure and Software Protection Agreement, Customer\'s indemnity obligations, or Customer\'s infringement or misappropriation of ClearSky\'s intellectual property.'
      ]},

      { h: '14. Indemnity', p: [
        'Customer will defend, indemnify, and hold harmless ClearSky and its members, officers, employees, and agents from and against any third-party claim, and any resulting loss, damage, liability, settlement, cost, and reasonable attorneys\' fees, arising out of (a) Customer Data, (b) Customer\'s use of the platform or its outputs, (c) Customer\'s breach of this agreement, or (d) Customer\'s violation of law or of any third party\'s rights.'
      ]},

      { h: '15. Term and termination', p: [
        'This agreement begins when you sign and continues until terminated. Either party may terminate at any time on written notice. ClearSky may terminate or suspend immediately for breach.',
        'On termination, your right to access the platform ends immediately, and you will stop using it and comply with the return-and-destruction obligations in the Mutual Nondisclosure and Software Protection Agreement.',
        'Sections 4, 5, 6 (as to ownership), 7, 10, 12, 13, 14, 15, 17, and 18 survive termination, as does the entire Mutual Nondisclosure and Software Protection Agreement per its own terms.'
      ]},

      { h: '16. Changes to these Terms', p: [
        'ClearSky may update these Terms. When it does, the version identifier changes and you will be asked to review and sign the updated agreement on your next sign-in. Continued access requires signature. If you do not sign, your access ends and Section 15 applies.'
      ]},

      { h: '17. Governing law, venue, and remedies', p: [
        'This agreement is governed by the laws of the State of Iowa, without regard to its conflict-of-laws rules. The United Nations Convention on Contracts for the International Sale of Goods does not apply.',
        'The parties consent to exclusive jurisdiction and venue in the state and federal courts located in Clinton County, Iowa, and waive any objection to that venue. [COUNSEL: decide whether to substitute arbitration, and whether to keep the class-action waiver below.]',
        'Customer acknowledges that a breach of Section 4 or of the Mutual Nondisclosure and Software Protection Agreement would cause ClearSky irreparable harm for which money damages would be inadequate, and that ClearSky is entitled to seek injunctive and other equitable relief without posting a bond and without proving actual damages, in addition to all other remedies.',
        'In any action to enforce this agreement, the prevailing party is entitled to recover its reasonable attorneys\' fees and costs.',
        'Each party waives any right to participate in a class, collective, or representative action against the other.'
      ]},

      { h: '18. General', p: [
        'Assignment. Customer may not assign this agreement, by operation of law or otherwise, without ClearSky\'s prior written consent. ClearSky may assign it freely, including in connection with a merger or sale of assets.',
        'Independent contractors. The parties are independent contractors. Nothing here creates a partnership, joint venture, agency, employment, or fiduciary relationship.',
        'Entire agreement. This agreement, together with the Mutual Nondisclosure and Software Protection Agreement and any executed order form, is the entire agreement between the parties on this subject and supersedes all prior discussions, proposals, and understandings.',
        'No waiver. A failure to enforce any provision is not a waiver of it.',
        'Severability. If a provision is held unenforceable, it is modified to the minimum extent necessary to make it enforceable, and the rest of the agreement remains in force.',
        'Notices. Notices to ClearSky go to dev@clearsky-usa.com. Notices to Customer go to the email address on the account. Notice is effective on the business day after it is sent.',
        'Force majeure. Neither party is liable for delay or failure caused by events beyond its reasonable control.'
      ]},

      { h: '19. Electronic signature', p: [
        'You agree that typing your name below and clicking to sign constitutes your electronic signature, has the same legal effect as a handwritten signature, and is intended to be binding under the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN) and the Uniform Electronic Transactions Act as adopted in Iowa.',
        'ClearSky will record the exact text of the agreement you signed, your typed name, entity, title, email address, account identifier, and the date and time of signature. You agree that record is admissible evidence of this agreement and waive any objection to its admissibility on the ground that it is electronic.'
      ]}
    ]
  },

  /* ═══════════════════════════════════════════════════════════════════════════
     DOCUMENT 2 — MUTUAL NDA + SOFTWARE PROTECTION
     ═══════════════════════════════════════════════════════════════════════════ */
  {
    id:    'nda',
    title: 'Mutual Nondisclosure and Software Protection Agreement',
    sub:   'Protects confidential information exchanged in both directions, and the platform itself.',
    consent: 'I have read the Mutual Nondisclosure and Software Protection Agreement and agree to be bound by it.',
    sections: [

      { h: '1. Parties and purpose', p: [
        'This Mutual Nondisclosure and Software Protection Agreement ("NDA") is between ClearSky Energy Solutions LLC, an Iowa limited liability company also operating as ClearSky Builders LLC ("ClearSky"), and the entity or individual signing below ("Recipient"). Each party may disclose information to the other; each is a "Disclosing Party" as to what it discloses and a "Receiving Party" as to what it receives.',
        'Purpose. The parties are exchanging information so that Recipient may evaluate and use the ClearSky-OMEGA platform, and so the parties may discuss and pursue energy project development, financing, procurement, and related business opportunities (the "Purpose"). Confidential Information may be used only for the Purpose.'
      ]},

      { h: '2. Confidential Information', p: [
        '"Confidential Information" means any non-public information disclosed by or on behalf of a Disclosing Party, in any form, whether or not marked confidential, that a reasonable person would understand to be confidential given its nature or the circumstances of disclosure.',
        'Without limiting that definition, ClearSky\'s Confidential Information expressly includes: the ClearSky-OMEGA platform and every part of it; its source code, HTML, JavaScript, stylesheets, configuration files, and build artifacts, including all of the foregoing that a browser necessarily receives in order to render a page; its architecture, data models, database schemas, collection structures, and security rules; its calculation logic, scoring methodologies, dispatch and value-stack models, incentive and tariff models, and layer definitions; non-public screens, workflows, and features; project pipelines, site lists, capacity analyses, and hosting-capacity work product; pricing, margins, and commercial terms; customer, partner, vendor, investor, and lender identities and relationships; and roadmaps, designs, and unreleased work.',
        'Recipient acknowledges that ClearSky\'s Confidential Information includes trade secrets under the Iowa Uniform Trade Secrets Act and the federal Defend Trade Secrets Act, that ClearSky takes reasonable measures to keep it secret, and that it derives independent economic value from not being generally known.'
      ]},

      { h: '3. Exclusions', p: [
        'Confidential Information does not include information the Receiving Party can show by contemporaneous written records: (a) was already lawfully in its possession, without a duty of confidentiality, before disclosure; (b) is or becomes public through no act or omission of the Receiving Party or anyone it is responsible for; (c) is lawfully received from a third party with no duty of confidentiality to the Disclosing Party; or (d) was independently developed by personnel with no access to and no reliance on the Disclosing Party\'s Confidential Information.',
        'Information is not excluded merely because it is embraced by more general public information, or because it can be assembled from separately public fragments. Access to a page in a browser does not make its code public.'
      ]},

      { h: '4. Obligations', p: [
        'The Receiving Party will: (a) use Confidential Information only for the Purpose; (b) not disclose it to any third party without the Disclosing Party\'s prior written consent; (c) protect it with at least the degree of care it uses for its own most sensitive information, and never less than a reasonable degree of care; (d) limit access to those of its employees, officers, and professional advisors who need it for the Purpose and who are bound by confidentiality obligations at least as protective as these; and (e) remain responsible for any breach by anyone it gave access to.',
        'The Receiving Party will not use Confidential Information to compete with the Disclosing Party, to solicit its customers or counterparties, or to gain any commercial advantage outside the Purpose.'
      ]},

      { h: '5. Source code, reverse engineering, and derivative development', p: [
        'This section survives everything else and is the material inducement for ClearSky to grant access.',
        'Recipient acknowledges that operating a web application necessarily transmits code to a browser, that this transmission is a technical requirement and not a publication, and that no such transmission grants Recipient any right in that code.',
        'Recipient will not, directly or indirectly: (a) save, copy, export, print, screenshot for retention, archive, or otherwise retain any portion of the platform\'s code, markup, scripts, styles, configuration, schemas, or security rules; (b) reverse engineer, decompile, disassemble, deobfuscate, or otherwise attempt to derive source code, algorithms, formulas, methodologies, or data structures from the platform; (c) use any part of the platform, or knowledge of it, to design, specify, build, commission, procure, or improve any product, tool, spreadsheet, dataset, template, or service that performs a substantially similar function; or (d) submit any part of the platform, its code, its interfaces, or its outputs to any third-party service, model, or contractor for any of the foregoing purposes.',
        'These restrictions apply regardless of whether the material was marked confidential and regardless of how Recipient came to possess it.'
      ]},

      { h: '6. No license, no rights granted', p: [
        'No license, assignment, option, or other right in any patent, copyright, trade secret, trademark, or other intellectual property is granted by this NDA or by any disclosure under it. All Confidential Information remains the property of the Disclosing Party.',
        'Nothing in this NDA obligates either party to disclose anything, to enter any further agreement, or to refrain from doing business with anyone.'
      ]},

      { h: '7. Compelled disclosure', p: [
        'If the Receiving Party is required by law, regulation, subpoena, or court order to disclose Confidential Information, it may do so, provided that (to the extent legally permitted) it gives the Disclosing Party prompt written notice, reasonable cooperation in seeking protective treatment, and discloses only the portion legally required.'
      ]},

      { h: '8. Non-circumvention', p: [
        'For two (2) years after the date of signature, Recipient will not use Confidential Information to circumvent ClearSky in any transaction, opportunity, or relationship introduced by ClearSky, including by contracting directly with a developer, offtaker, lender, investor, utility contact, supplier, or site owner first identified to Recipient through ClearSky or through the platform, in a manner that excludes ClearSky from a transaction it originated. [COUNSEL: confirm the two-year term and the breadth of "introduced by".]'
      ]},

      { h: '9. Return and destruction', p: [
        'On the Disclosing Party\'s written request, or on termination of the parties\' relationship, the Receiving Party will promptly return or irreversibly destroy all Confidential Information in its possession or control, including all copies, notes, extracts, exports, and derivative materials, and on request certify that destruction in writing signed by an officer.',
        'The Receiving Party may retain one archival copy solely to the extent required by law or by automated backup systems, which remains subject to this NDA for as long as it is retained.',
        'There is no residuals right. Recollection of Confidential Information does not license its use.'
      ]},

      { h: '10. Term and survival', p: [
        'This NDA applies to Confidential Information disclosed at any time, before or after signature, and continues for three (3) years after the parties\' relationship ends.',
        'As to any Confidential Information that constitutes a trade secret, and as to the obligations in Section 5, the obligations continue for as long as the information remains a trade secret under applicable law, or indefinitely, whichever is longer.'
      ]},

      { h: '11. Equitable relief', p: [
        'The Receiving Party acknowledges that a breach or threatened breach of this NDA would cause the Disclosing Party irreparable harm for which money damages would be an inadequate remedy. The Disclosing Party is entitled to seek temporary, preliminary, and permanent injunctive relief and specific performance, without posting a bond and without proving actual damages, in addition to every other remedy available at law or in equity.',
        'The prevailing party in any action to enforce this NDA is entitled to recover its reasonable attorneys\' fees and costs.'
      ]},

      { h: '12. Notice of unauthorized use', p: [
        'The Receiving Party will notify the Disclosing Party in writing within two (2) business days of becoming aware of any unauthorized access, use, disclosure, copying, or loss of Confidential Information, and will cooperate reasonably in investigating and mitigating it.'
      ]},

      { h: '13. Whistleblower immunity notice', p: [
        'Under 18 U.S.C. § 1833(b), an individual is not criminally or civilly liable under any federal or state trade secret law for disclosing a trade secret (a) in confidence to a federal, state, or local government official or to an attorney, solely for the purpose of reporting or investigating a suspected violation of law, or (b) in a complaint or other document filed under seal in a lawsuit or other proceeding. Nothing in this NDA limits that immunity.'
      ]},

      { h: '14. No warranty as to Confidential Information', p: [
        'Confidential Information is provided "as is". Neither party warrants its accuracy or completeness, and neither is liable to the other for reliance on it, except as expressly agreed in a separate written agreement.'
      ]},

      { h: '15. Governing law and venue', p: [
        'This NDA is governed by the laws of the State of Iowa, without regard to its conflict-of-laws rules. The parties consent to exclusive jurisdiction and venue in the state and federal courts located in Clinton County, Iowa, and waive any objection to that venue.'
      ]},

      { h: '16. General', p: [
        'This NDA is binding on the parties and their successors and permitted assigns. Recipient may not assign it without ClearSky\'s prior written consent.',
        'This NDA may be amended only in a writing signed by both parties, or by ClearSky issuing an updated version that Recipient signs through the platform.',
        'If any provision is held unenforceable, it is modified to the minimum extent necessary to make it enforceable and the rest remains in force.',
        'This NDA and the Platform Terms of Service are the entire agreement between the parties on this subject and supersede all prior confidentiality agreements on it, except that any separately executed written NDA between the parties remains in force and, where its terms conflict, the more protective term controls in favor of the Disclosing Party.'
      ]},

      { h: '17. Electronic signature', p: [
        'Typing your name below and clicking to sign constitutes your electronic signature, has the same legal effect as a handwritten signature, and is intended to be binding under E-SIGN and the Uniform Electronic Transactions Act as adopted in Iowa. You represent that you are authorized to bind the entity named below.'
      ]}
    ]
  }
  ]
};
