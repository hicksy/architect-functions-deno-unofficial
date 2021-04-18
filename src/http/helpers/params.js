export default function interpolateParams (req) {
  // Handle HTTP API v2.0 payload scenarios, which omit params instead of passing them as null
  if (req.version && req.version === '2.0') {
    let { requestContext: context } = req
    if (context && context.http && context.http.method) {
      req.httpMethod = context.http.method
    }
    let unUndefined = [ 'body', 'pathParameters', 'queryStringParameters' ]
    unUndefined.forEach(i => {
      if (req[i] === undefined) req[i] = {}
    })
    // Expect 'GET /foo' or '$default'
    req.resource = req.routeKey.split(' ')[1] || req.routeKey
    // Backfill `req.path`
    req.path = req.rawPath
  }

  // Un-null APIG-proxy-Lambda params in 6+
  let unNulled = [ 'body', 'pathParameters', 'queryStringParameters', 'multiValueQueryStringParameters' ]
  unNulled.forEach(i => {
    if (req[i] === null) req[i] = {}
  })

  // Backfill params generated by <6 VTL
  if (!req.method) req.method = req.httpMethod
  if (!req.params) req.params = req.pathParameters
  if (!req.query)  req.query  = req.queryStringParameters

  // Legacy path parameter interpolation; 6+ REST gets this for free in `req.path`
  let params = /\{\w+\}/g
  if (params.test(req.path)) {
    let matches = req.path.match(params)
    let vars = matches.map(a => a.replace(/\{|\}/g, ''))
    let idx = 0
    matches.forEach(m => {
      req.path = req.path.replace(m, req.params[vars[idx]])
      idx += 1
    })
  }
  return req
}
