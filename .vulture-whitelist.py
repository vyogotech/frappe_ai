# Names a framework reads by contract, which vulture cannot see a caller for.
# frappe's app loader reads app_version off hooks.py: frappe/__init__.py get_hooks().
app_version
# requests' own API: the code under test calls iter_lines(decode_unicode=True), so the stub must
# accept that exact keyword even though its body has no use for it.
decode_unicode
# unittest passes cls to setUpClass/tearDownClass.
cls
