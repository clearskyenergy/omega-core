/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/funding-v2-examples.js — illustrative packages for the preview
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   These are not deals, not sites, and not market data. The figures are
   inputs so a reviewer can see a complete package, a thin one, and a
   blocked one. Nothing here is a tariff, a credit, or a price book.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var SLOTS = ['site-control', 'interconnection', 'bom', 'one-line', 'plot', 'cost'];

function docs(slots, withBytes) {
  return slots.map(function (s) {
    var row = { slot: s, name: s + '.pdf', id: 'doc-' + s, asOf: '2026-06-01' };
    if (withBytes && s === 'one-line') row.text = 'Preview one-line. Not a drawing.';
    return row;
  });
}

function base(id, name) {
  return {
    id: id, illustrative: true, name: name, state: 'IL', city: 'Preview',
    tech: 'storage', mw: 4, mwh: 16, devStage: 'Contract executed',
    siteControl: { instrument: 'lease', date: '2026-04-01', party: 'Preview landowner', documentId: 'doc-site-control' },
    tariff: { utility: 'Preview Utility', schedule: 'Preview rate schedule', source: 'Utility tariff book on file', asOf: '2026-03-01' },
    design: {
      bom: { id: 'doc-bom', name: 'BOM.pdf' },
      oneLine: { id: 'doc-one-line', name: 'one-line.pdf' },
      plot: { id: 'doc-plot', name: 'plot.pdf' }
    },
    returns: { irr: 0.12, npv: 900000, paybackYears: 6.5, termYears: 10, basis: 'after-tax' },
    documents: docs(SLOTS, true)
  };
}

function complete() {
  var p = base('preview-complete', 'Preview · complete package');
  p.interconnection = { kind: 'agreement', utility: 'Preview Utility', source: 'Executed interconnection agreement on file', asOf: '2026-05-01', queueId: 'PREVIEW-1' };
  p.incentives = { claimed: true, programs: [{ name: 'Preview credit', source: 'Eligibility memo on file' }] };
  p.cost = { amount: 4800000, lines: [
    { label: 'Equipment', amount: 3000000, source: 'Vendor quote on file', asOf: '2026-04-15' },
    { label: 'Install', amount: 1800000, source: 'Installer quote on file', asOf: '2026-04-15' }
  ] };
  p.production = { method: '8760 on the recorded load', source: 'Interval load on file', asOf: '2026-02-01', annualKwh: 2000000, assumed: false };
  p.valueStack = { streams: [
    { name: 'Demand charge', assumption: 'Assumption recorded with the stream', source: 'Value stack run on file' },
    { name: 'Energy', assumption: 'Assumption recorded with the stream', source: 'Value stack run on file' }
  ] };
  p.offtake = { position: 'signed', party: 'Preview offtaker', source: 'Contract on file' };
  p.permitting = { status: 'approved', asOf: '2026-06-01', authority: 'Preview authority' };
  return p;
}

function ready() {
  var p = base('preview-ready', 'Preview · listed, with gaps');
  p.mw = 2.5; p.mwh = 10; p.devStage = 'Proposal issued';
  p.tech = 'solar_bess';
  p.returns = { irr: 0.09, npv: 400000, paybackYears: 8, termYears: 15, basis: 'after-tax' };
  p.interconnection = { kind: 'application', utility: 'Preview Utility', source: 'Application receipt on file', asOf: '2026-05-12' };
  p.incentives = { claimed: true, programs: [{ name: 'Preview credit', source: 'Eligibility memo on file' }] };
  p.cost = { amount: 3100000, lines: [
    { label: 'Equipment', amount: 2000000, source: 'Vendor quote on file', asOf: '2026-04-02' },
    { label: 'Install', amount: 1100000, source: 'Installer quote on file', asOf: '2026-04-02' }
  ] };
  p.production = { method: '8760 on the recorded load', source: 'Interval load on file', asOf: '2026-01-20', annualKwh: 1400000, assumed: false };
  p.valueStack = { streams: [
    { name: 'Demand charge', assumption: 'Assumption recorded with the stream', source: 'Value stack run on file' },
    { name: 'Capacity', assumption: 'Assumption recorded with the stream', source: 'Value stack run on file' }
  ] };
  p.offtake = { position: 'named', party: 'Preview customer' };
  p.permitting = { status: 'applied', asOf: '2026-05-20', authority: 'Preview authority' };
  return p;
}

function thin() {
  var p = base('preview-thin', 'Preview · not listed yet');
  p.devStage = 'Qualifying — gathering utility data';
  p.interconnection = { kind: 'screening', utility: 'Preview Utility', source: 'Hosting-capacity reading on file', asOf: '2026-05-01' };
  p.incentives = { claimed: false };
  p.cost = { amount: 4800000, lines: [{ label: 'Total', amount: 4800000, source: 'Site model total', asOf: '2026-05-01' }] };
  p.production = { method: 'Typical load shape', source: 'Labeled assumption', annualKwh: 1800000, assumed: true };
  p.valueStack = { streams: [{ name: 'Demand charge', assumption: 'Assumption recorded with the stream', source: 'Value stack run on file' }] };
  p.returns = { irr: 0.07, npv: 120000, paybackYears: 11, termYears: 10, basis: 'after-tax' };
  p.offtake = { position: 'merchant' };
  p.permitting = { status: 'not-started' };
  return p;
}

function blocked() {
  var p = base('preview-blocked', 'Preview · missing the design');
  p.devStage = 'Opportunity introduced';
  p.design = { bom: { id: 'doc-bom', name: 'BOM.pdf' } };
  p.interconnection = { kind: 'screening', utility: 'Preview Utility', source: 'Hosting-capacity reading on file', asOf: '2026-05-01' };
  p.incentives = { claimed: false };
  p.cost = { amount: 1000000, lines: [] };
  p.returns = {};
  p.offtake = { position: 'merchant' };
  p.permitting = { status: 'not-started' };
  p.documents = docs(['site-control', 'interconnection', 'bom']);
  return p;
}

function packages() { return [complete(), ready(), thin(), blocked()]; }

module.exports = { packages: packages, complete: complete, ready: ready, thin: thin, blocked: blocked };
