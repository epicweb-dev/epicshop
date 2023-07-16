# Deployment

When deploying you don't want to allow users to start servers on your machine.
So you need to set the `KCDSHOP_DEPLOYED` environment variable to "true" which
will protect all routes and hide UI elements that are not needed for deployment.
This will also reference the `package.json` value for `kcd-workshop.githubRoot`
as the root for all links to files so `<InlineFile />` and `<LaunchEditor />`
will open the files on GitHub instead of on your local machine.
