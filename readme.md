# arc-plugin-custom-domain

Setup a custom domain without pain!

Features:

- Creates all the necessary resources for a CloudFront CDN distribution
- Optionally create DNS records in Route53 including an automatically verified certificate in ACM
- Automatically detects `@ws` and adds magic same-origin route for `_/wss`; this enables session sharing to web socket lambda functions

# Usage

```bash
npm install arc-plugin-custom-domain
```

- If you want to use Route53 then use `@dns`
- If you want to manage your DNS elsewhere then use `@cdn`

> [!IMPORTANT]  
> To use this plugin your application must be deployed in `us-east-1`. This is a limitation of how CloudFront works with API Gateway and ACM Certificates.

## `@dns`

Creates a CloudFront distribution, Route53 A alias record and ACM Certificate automatically; you need to specify `domain` and `zone` for the HostedZoneId. Buying/importing a domain w Route53 should automatically setup a HostedZone for you.

Example:

```
@app
myapp

@http

@plugins
arc-plugin-custom-domain

@dns
staging b4.example.com
production example.com
zone XKDISW7D
```

## `@cdn`

Creates a Cloudfront distribution; you need to specify `staging` domain, `production` domain and `cert` with an ACM Certificate ARN.

Requirements:

- Create a certificate and verify it in ACM (AWS Certificate Manager) console in `us-east-1` (ensure you set not only domain `example.com` but also add `*.domain.com` so same cert can be used for staging
- After deployment; create an A record in your DNS registrar to point to the generated CloudFront distribution (look AWS CloudFront console to find this)

Example:

```
@app
myapp

@http

@plugins
arc-plugin-custom-domain

@cdn
staging b4.example.com
production example.com
cert arn:aws:acm:us-east-1:555:certificate/xxx
```
