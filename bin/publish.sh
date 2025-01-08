stackId="$(jq -r '.STACK_ID' ./contexts/context.json)"
landscape="$(jq -r '.TAGS.Landscape' ./contexts/context.json)"
sh -c "aws s3 cp ./frontend/bootstrap/index.htm s3://${stackId}-${landscape}-static-site-content-bootstrap/"