# shell: developer
Vertical dashboard shell. Today every vertical loads /index.html; the difference
is the widget/tool defaults in Firestore `verticals/developer`. A file named
index.html placed here is loaded instead of the root index when
omega_orgs.shell == 'developer'. Keep it a thin wrapper: same scripts, different
layout — never a fork of the root index.
