# ETT (Ethical Transparency Tool)

Documentation pending...

Create a `./contexts/context.json` file and adjust the values appropriately.
*NOTE: Make sure the BUCKET_NAME value does not collide with an existing bucket.*

```
{
  "SCENARIO": "default",
  "STACK_ID": "ett",
  "ACCOUNT": "[Your account ID]",
  "REGION": "[Your desired region]",
  "BUCKET_NAME": "ett-static-site-content",
  "TAGS": {
    "Service": "client",
    "Function": "ett",
    "Landscape": "dev"
  }
}
```

