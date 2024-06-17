@app
arc-plugin-cdn

@http
/
  src /http
  method get

@wss
connect
  src /ws/connect

default
  src /ws/default

disconnect
  src /ws/disconnect 

@plugins
dns
  src /plugins/dns.mjs

@aws
region us-east-1

@dns
staging b4.deno.town
production deno.town
zone Z1CHQT8OWWGRND

#@cdn
#staging b4.deno.town
#production deno.town
#cert arn:aws:acm:us-east-1:852793780743:certificate/4079e793-7a3c-4f23-8f85-d348ed477f59
