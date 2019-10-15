let test = require('tape')
let proxyquire = require('proxyquire')
let readStub = params => params
let proxyPublic = proxyquire('../../../../../src/http/proxy/public', {
  './read': readStub
})
let reqs = require('../http-req-fixtures')
let req = reqs.arc6.getIndex
let proxyReq = reqs.arc5.getProxyPlus

let stagingBucket = 'my-staging-bucket'
let productionBucket = 'my-production-bucket'
let folder = 'file-folder'
let basicBucketConfig = {
  bucket:{
    staging: stagingBucket,
  }
}

test('Set up env', t => {
  t.plan(1)
  t.ok(proxyPublic, 'Loaded public')
})

test('Config: bucket', async t => {
  t.plan(5)
  let proxy = await proxyPublic()

  // Test no bucket config
  let result = await proxy(req)
  t.equal(result.statusCode, 502, 'Missing bucket config responds with 502')
  t.ok(result.body.includes('Index not found'), 'Missing bucket config presents helpful error')

  // Test ARC_STATIC_BUCKET
  process.env.ARC_STATIC_BUCKET = productionBucket
  result = await proxy(req)
  t.equal(result.Bucket, productionBucket, 'ARC_STATIC_BUCKET sets bucket')

  // Test ARC_STATIC_BUCKET vs config
  proxy = await proxyPublic({
    bucket:{
      production: stagingBucket
    }
  })
  result = await proxy(req)
  t.equal(result.Bucket, productionBucket, 'ARC_STATIC_BUCKET overrides config')
  delete process.env.ARC_STATIC_BUCKET

  // Test config.bucket
  proxy = await proxyPublic({
    bucket:{
      staging: stagingBucket
    }
  })
  result = await proxy(req)
  t.equal(result.Bucket, stagingBucket, 'config.bucket sets bucket')
})

test('Config: SPA', async t => {
  t.plan(6)

  // Test spa:true to get /
  let proxy = await proxyPublic({
    bucket:{
      staging: stagingBucket
    },
    spa: true
  })
  let result = await proxy(req)
  t.equal(result.Key, 'index.html', 'spa:true calls root index.html requesting /')

  // Test spa: true to get /{proxy+}
  proxy = await proxyPublic({
    bucket:{
      staging: stagingBucket
    },
    spa: true
  })
  result = await proxy(proxyReq)
  t.equal(result.Key, 'index.html', 'spa:true always calls root index.html, even when not requesting /')

  // Test spa:false
  process.env.ARC_STATIC_SPA = 'false'
  proxy = await proxyPublic({
    bucket:{
      staging: stagingBucket
    },
    spa: true
  })
  result = await proxy(proxyReq)
  t.notEqual(result.Key, 'index.html', 'spa:false does not necessarily call for index.html')
  t.notOk(result.config.spa, `ARC_STATIC_SPA = 'false' disables spa config`)

  // Test spa:false with root
  result = await proxy(req)
  t.equal(result.Key, 'index.html', 'spa:false still calls for root index.html, when requesting /')

  // Test spa:false with folder
  let trailingSlash = JSON.parse(JSON.stringify(proxyReq))
  trailingSlash.path = trailingSlash.path + '/'
  result = await proxy(trailingSlash)
  t.equal(result.Key, 'nature/hiking/index.html', 'spa:false to a dir calls $DIR/index.html')
  delete process.env.ARC_STATIC_SPA
})

/*
// TODO Test config.alias? (undocumented, may retire)
test('Config: alias', t => {
  proxy = await proxyPublic({
    alias: req.path
  })
  t.end()
})
*/

test('Config: folder', async t => {
  t.plan(3)

  // Test ARC_STATIC_FOLDER
  process.env.ARC_STATIC_FOLDER = folder
  let proxy = await proxyPublic({
    bucket:{
      staging: stagingBucket
    }
  })
  let result = await proxy(req)
  t.equal(result.Key, `${folder}/index.html`, 'ARC_STATIC_FOLDER sets folder')

  // Test ARC_STATIC_FOLDER vs config
  proxy = await proxyPublic({
    bucket:{
      staging: stagingBucket,
      folder: 'rando'
    }
  })
  result = await proxy(req)
  t.equal(result.Key, `${folder}/index.html`, 'ARC_STATIC_FOLDER overrides folder')
  delete process.env.ARC_STATIC_FOLDER

  // Test folder
  proxy = await proxyPublic({
    bucket:{
      staging: stagingBucket,
      folder
    }
  })
  result = await proxy(req)
  t.equal(result.Key, `${folder}/index.html`, 'config.bucket.folder sets folder')
})

test('Strip API Gateway warts', async t => {
  t.plan(2)
  let apigReq = JSON.parse(JSON.stringify(req))
  apigReq.path = '/staging/foo'
  let proxy = await proxyPublic(basicBucketConfig)
  let result = await proxy(apigReq)
  t.equal(result.Key, 'foo', 'Leading staging/ is stripped from keys')

  apigReq.path = '/production/foo'
  result = await proxy(apigReq)
  t.equal(result.Key, 'foo', 'Leading production/ is stripped from keys')
})

test('IfNoneMatch param', async t => {
  t.plan(1)
  let ifNoneMatchReq = JSON.parse(JSON.stringify(req))
  ifNoneMatchReq.headers['If-None-Match'] = 'foo'
  let proxy = await proxyPublic(basicBucketConfig)
  let result = await proxy(ifNoneMatchReq)
  t.equal(result.IfNoneMatch, 'foo', 'IfNoneMatch param correctly set')
})

// isProxy
test('isProxy param', async t => {
  t.plan(1)
  let proxy = await proxyPublic(basicBucketConfig)
  let result = await proxy(proxyReq)
  t.ok(result.isProxy, 'isProxy param correctly set')
})

test('Read shape', async t => {
  t.plan(5)
  let proxy = await proxyPublic(basicBucketConfig)
  let result = await proxy(req)
  let checkParam = param => result.hasOwnProperty(param)
  t.ok(checkParam('Key'), 'Read params include Key')
  t.ok(checkParam('Bucket'), 'Read params include Bucket')
  t.ok(checkParam('IfNoneMatch'), 'Read params include IfNoneMatch')
  t.ok(checkParam('isProxy'), 'Read params include isProxy')
  t.ok(checkParam('config'), 'Read params include config')
})
