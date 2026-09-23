# ACCEPTANCE GUIDE

## PASS requires, when applicable
- correct repository/branch/SHA
- real application materialized locally
- required runtime assets present
- canonical build succeeds
- localhost application responds
- real browser loads the target route
- no fatal JavaScript failure
- expected canvas exists
- WebGL context works for WebGL tasks
- renderer identity is recorded
- screenshots contain the real application
- requested interactions produce the expected documented state changes

## FAIL examples
- required assets missing
- fatal build error
- route cannot load
- blank/zero-sized canvas
- required WebGL context unavailable
- failed model/texture requests
- screenshots created from a reconstruction rather than the application
