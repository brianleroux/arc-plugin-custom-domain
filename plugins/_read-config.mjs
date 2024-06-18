export default function config ({aws, dns, cdn, http}, stage) {

  let errors = []

  if (!http) {
    errors.push('missing @http')
  }

  // ensure region is defined and is us-east-1
  let region = aws && aws.find(a => a[0] === 'region') ? aws.find(a => a[0] === 'region')[1] : process.env.AWS_REGION
  if (region != 'us-east-1') 
    errors.push('invalid region; must be us-east-1')

  if (dns && cdn) 
    errors.push('only one of @dns or @cdn can be configured')

  if (!dns && !cdn) 
    errors.push('must have one of @dns or @cdn')

  // @dns requires domain and zone
  // @cdn requires domain and cert arn
  let domain = false
  let cert = false
  let zone = false
  let zoneDomain = false

  if (dns) {
    // we need to set domain and certificate is implicit to the cert resource
    domain = dns.find(a=> a[0] === stage) ? dns.find(a=> a[0] === stage)[1] : false
    if (!domain) errors.push(`missing ${stage} domain from config`)
    zone = dns.find(a=> a[0] === 'zone') ? dns.find(a=> a[0] === 'zone')[1] : false
    if (!zone) errors.push('missing zone from config')
    zoneDomain = dns.find(a=> a[0] === 'production') ? dns.find(a=> a[0] === 'production')[1] : false
    if (!zoneDomain) errors.push('missing production domain from config')
  }

  if (cdn) {
    // we need to set domain, and certificate to an arn passed in
    domain = cdn.find(a=> a[0] === stage) ? cdn.find(a=> a[0] === stage)[1] : false
    if (!domain) errors.push(`missing ${stage} domain from config`)
    cert = cdn.find(a=> a[0] === 'cert') ? cdn.find(a=> a[0] === 'cert')[1] : false
    if (!cert) errors.push('missing cert from config')
    if (cert.includes('us-east-1') === false) errors.push('acm certificate MUST be in us-east-1 region')
  }

  if (errors.length > 0) {
    let msg = 'arc-plugin-custom-domain\n'
    for (let e of errors) msg += '-' + e + '\n'
    throw new Error(msg)
  }

  return {domain, cert, zone, zoneDomain}
}
