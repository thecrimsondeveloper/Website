# VALIDATE RESULT

A successful run should independently check:
- repository materialized
- expected branch/SHA recorded
- dependencies available
- build succeeded or was legitimately unnecessary
- localhost responded
- browser loaded the page
- no fatal JavaScript errors
- required assets loaded
- expected canvas exists when required
- WebGL works when required
- renderer identity captured
- screenshots are non-empty
- requested interactions succeeded

Failed required network assets, missing GLBs/textures, blank WebGL canvases, or fatal runtime errors must fail validation.

Read `../guides/ACCEPTANCE-GUIDE.md`.
