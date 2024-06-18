import config from './_read-config.mjs'

// this plugin can be used two ways:
//
// - @dns we setup EVERYTHING with Route53 and ACM
// - @cdn and you configure dns w external provider and manually create/verify an acm certificate
//
export let deploy = {

  start ({ arc, cloudformation, stage }) {

    // @dns requires staging domain, production domain and zone
    // @cdn requires staging domain, production donmain and cert arn
    let {domain, cert, zone, zoneDomain } = config(arc, stage)

    if (arc.dns) { 

      // create a cert
      cloudformation.Resources.Certificate = {
        Type: 'AWS::CertificateManager::Certificate',
        Properties: {
          ValidationMethod: 'DNS', // required!
          DomainName: zoneDomain,
          SubjectAlternativeNames: [ `*.${zoneDomain}` ],
          DomainValidationOptions: [ {
            DomainName: zoneDomain,
            HostedZoneId: zone,
          } ]
        }
      }

      // create A record
      cloudformation.Resources.Alias = {
        Type: 'AWS::Route53::RecordSetGroup',
        Properties: {
          HostedZoneName: `${zoneDomain}.`,
          RecordSets: [ {
            Name: `${domain}.`,
            Type: 'A',
            AliasTarget: {
              HostedZoneId: 'Z2FDTNDATAQYW2', // yes this is hardcoded
              DNSName: {
                'Fn::GetAtt': [ 'CDN', 'DomainName' ]
              }
            }
          } ]
        }
      }
    }

    // create an apig domain
    cloudformation.Resources.Domain = {
      Type: 'AWS::ApiGatewayV2::DomainName',
      Properties: {
        DomainName: domain,
        DomainNameConfigurations: [ {
          CertificateArn: arc.cdn? cert : { Ref: 'Certificate' }
        } ]
      }
    }

    /* create apig mapping */
    cloudformation.Resources.Mapping = {
      Type: 'AWS::ApiGatewayV2::ApiMapping',
      DependsOn: 'Domain', // you'd think this wasn't neccessary but it is
      Properties: {
        Stage: '$default',
        DomainName: domain,
        ApiId: { Ref: 'HTTP' }
      }
    }

    // create origin request policy
    cloudformation.Resources.OriginRequestPolicy = {
      Type: 'AWS::CloudFront::OriginRequestPolicy',
      Properties: {
        OriginRequestPolicyConfig: {
          Name: domain.replace(/\./g, '-') + '-origin-request-policy',
          CookiesConfig: { CookieBehavior: 'all' },
          HeadersConfig: { HeaderBehavior: 'allViewer' },
          QueryStringsConfig: { QueryStringBehavior: 'all' }
        }
      }
    }

    // create a cache policy for our cloudfront distribution
    cloudformation.Resources.CachePolicy = {
      Type: 'AWS::CloudFront::CachePolicy',
      Properties: {
        CachePolicyConfig: {
          Name: domain.replace(/\./g, '-') + '-cache-policy',
          DefaultTTL: 86400,
          MaxTTL: 31536000,
          MinTTL: 0,
          ParametersInCacheKeyAndForwardedToOrigin: {
            EnableAcceptEncodingGzip: true,
            EnableAcceptEncodingBrotli: true,
            HeadersConfig: {
              HeaderBehavior: 'whitelist',
              Headers:  [
                'Authorization',
                'Sec-WebSocket-Key',
                'Sec-WebSocket-Version',
                'Sec-WebSocket-Protocol',
                'Sec-WebSocket-Accept',
                'Sec-WebSocket-Extensions'
              ]
            },
            CookiesConfig: { CookieBehavior: 'none' },
            QueryStringsConfig: { QueryStringBehavior: 'none' },
          }
        }
      }
    }

    // create cloudfront distribution
    cloudformation.Resources.CDN = {
      Type: 'AWS::CloudFront::Distribution',
      Properties: {
        DistributionConfig: {
          Aliases: [ domain ], // Important!
          HttpVersion: 'http2',
          IPV6Enabled: true,
          Enabled: true,
          Origins: [ {
            Id: 'HttpEdgeOrigin',
            DomainName: {
              'Fn::Sub': [
                '${ApiId}.execute-api.${AWS::Region}.amazonaws.com',
                { ApiId: { Ref: 'HTTP' } }
              ]
            },
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginKeepaliveTimeout: 5, // NOTE FOR RYAN: up this for API edge config
              OriginProtocolPolicy: 'https-only', // thas right
              OriginReadTimeout: 30,
              OriginSSLProtocols: [ 'TLSv1', 'TLSv1.1', 'TLSv1.2' ],
            }
          }],
          DefaultCacheBehavior: {
            TargetOriginId: 'HttpEdgeOrigin',
            OriginRequestPolicyId: { Ref: 'OriginRequestPolicy' },
            CachePolicyId: { Ref: 'CachePolicy' },
            ViewerProtocolPolicy: 'redirect-to-https',
            MinTTL: 0,
            AllowedMethods: [ 'HEAD', 'DELETE', 'POST', 'GET', 'OPTIONS', 'PUT', 'PATCH' ],
            CachedMethods: [ 'GET', 'HEAD' ],
            SmoothStreaming: false,
            DefaultTTL: 86400,
            MaxTTL: 31536000,
            Compress: true, // Important!
          },
          PriceClass: 'PriceClass_All',
          ViewerCertificate: {
            AcmCertificateArn: arc.cdn? cert : {
              Ref: 'Certificate'
            },
            SslSupportMethod: 'sni-only',
            MinimumProtocolVersion: 'TLSv1.2_2019',
          }
        }
      }
    }

    // stuff that only applies to getting the web socket endpoint on the same-origin
    if (arc.ws) {
      
      // create origin request policy
      cloudformation.Resources.WssOriginRequestPolicy = {
        Type: 'AWS::CloudFront::OriginRequestPolicy',
        Properties: {
          OriginRequestPolicyConfig: {
            Name: domain.replace(/\./g, '-') + '-wss-origin-request-policy',
            CookiesConfig: {
              CookieBehavior: 'whitelist',
              Cookies: [ '_idx' ]
            },
            HeadersConfig: {
              HeaderBehavior: 'whitelist',
              Headers: [
                // 'Authorization',
                // 'Cookie',
                // 'Set-Cookie',
                // 'Host',
                'Sec-WebSocket-Key',
                'Sec-WebSocket-Version',
                'Sec-WebSocket-Protocol',
                'Sec-WebSocket-Accept',
                'Sec-WebSocket-Extensions'
              ]
            },
            QueryStringsConfig: { QueryStringBehavior: 'all' }
          }
        }
      }

      // fix the _wss url
      cloudformation.Resources.RequestFunction = {
        Type: 'AWS::CloudFront::Function',
        Properties: {
          Name: domain.replace(/\./g, '-') + '-request-function',
          AutoPublish: true,
          FunctionCode: `
            function handler (event) {
              var request = event.request;
              request.uri = '/${stage}';
              return request;
            }
          `,
          FunctionConfig: {
            Comment: 'function to remove trailing _wss from the request uri',
            Runtime: 'cloudfront-js-1.0'
          },
        }
      }

      // add the ws origin
      cloudformation.Resources.CDN.Properties.DistributionConfig.Origins.push({
        Id: 'WssEdgeOrigin',
        DomainName: {
          'Fn::Sub': [
            '${WS}.execute-api.${AWS::Region}.amazonaws.com',
            {} ]
        },
        // OriginPath: '/' + stage,
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginKeepaliveTimeout: 5, // NOTE FOR RYAN: up this for API edge config
          OriginProtocolPolicy: 'https-only', // thas right
          OriginReadTimeout: 30,
          OriginSSLProtocols: [ 'TLSv1', 'TLSv1.1', 'TLSv1.2' ],
        }
      })

      cloudformation.Resources.CDN.Properties.DistributionConfig.CacheBehaviors = [{
        TargetOriginId: 'WssEdgeOrigin',
        PathPattern: '/_wss/*',
        // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policy-all-viewer-except-host-header
        OriginRequestPolicyId: { Ref: 'WssOriginRequestPolicy' }, // 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
        // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policy-caching-disabled
        CachePolicyId: { Ref: 'CachePolicy' }, // '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
        FunctionAssociations: [ {
          EventType: 'viewer-request',
          FunctionARN: { 'Fn::GetAtt': [ 'RequestFunction', 'FunctionMetadata.FunctionARN' ] }
        } ],
        ViewerProtocolPolicy: 'allow-all',
        MinTTL: 0,
        AllowedMethods: [ 'HEAD', 'DELETE', 'POST', 'GET', 'OPTIONS', 'PUT', 'PATCH' ],
        CachedMethods: [ 'GET', 'HEAD' ],
        SmoothStreaming: false,
        DefaultTTL: 86400,
        MaxTTL: 31536000,
        Compress: true, // Important!
      }]
    }

    return cloudformation
  }
}
