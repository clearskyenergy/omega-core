#!/usr/bin/env python3
"""Run the unchanged offline API suite against both rules snapshots.
A matched existing failure is reported, never described as a passing API suite.
This review is not authorization to merge or deploy production.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(os.environ['REVIEW_DIR'])
target = Path('firestore.rules')
candidate = (root / 'candidate-firestore.rules').read_bytes()
baseline = (root / 'baseline-firestore.rules').read_bytes()
assert target.read_bytes() == candidate
assert hashlib.sha256(candidate).hexdigest() == '4db3827f9f0fcc9c0e9032aa815fc201b4ff85f91e729c39553d1f6f8ae86b27'
results = {}
try:
    for label, data in [('baseline', baseline), ('candidate', candidate)]:
        target.write_bytes(data)
        result = subprocess.run(['node', 'scripts/test-site-crm.js'], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        (root / ('site-crm-' + label + '.log')).write_text(result.stdout)
        results[label] = {'exit_code': result.returncode, 'completed_passes': sum(line.startswith('PASS ') for line in result.stdout.splitlines()), 'output': result.stdout}
        print(label + ' API suite exit code: ' + str(result.returncode))
        print(result.stdout)
finally:
    target.write_bytes(candidate)

same = results['baseline']['exit_code'] == results['candidate']['exit_code'] and results['baseline']['output'] == results['candidate']['output']
report = {label: {key: value for key, value in result.items() if key != 'output'} for label, result in results.items()}
report['identical_outcomes'] = same
report['suite_passed'] = results['candidate']['exit_code'] == 0
report['production_deployment'] = False
(root / 'api-results.json').write_text(json.dumps(report, indent=2) + '\n')
assert same, 'Baseline and candidate API results differ: stop for review'
if not report['suite_passed']:
    print('::warning::The existing Site CRM API suite fails identically on baseline and candidate. Logs retained; this is NOT an API test pass. No production deployment is authorized by this review.')
print('PASS: API outcomes are unchanged by the rules-only patch.')
