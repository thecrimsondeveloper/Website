export function validate({ build, captures, webglRequired, renderer, fatalError }) {
  const checks = {
    build: build.status !== 'fail',
    captures: captures.length > 0 && captures.every(item => item.bytes > 1000 && (!item.httpStatus || item.httpStatus < 400)),
    webgl: !webglRequired || Boolean(renderer?.available),
    fatalError: !fatalError,
  };
  return { status: Object.values(checks).every(Boolean) ? 'pass' : 'fail', checks };
}
