Reference: Workday Developer CLI (WDCLI) for Extend Apps Commands
Account
list

Displays all companies that the authenticated user belongs to.

wdcli account list

switch

Switch to a different company. On login, the WDCLI defaults to a user’s primary company.

wdcli account switch

App
builds

Displays builds of a given app version.

wdcli app builds charitableDonationsUserBuild_cqbvyp

builds logs

Displays build logs of a given build.

wdcli app builds logs 8d7c91f17b3ed8aea3c15a9a2a1da0db

copy

Copies a local app to a new local directory with a new app reference ID. To create a Built on Workday Extend app using the copy command, you can optionally add the --built-on-workday flag.

wdcli app copy charitableDonationsUserBuild_cqbvyp --name charitableDonationsNewApp_cqbvyp

create

Creates an app.

wdcli app create charitableDonationsUserBuild_cqbvyp

deploy

Deploys the application into the specified tenant.

wdcli app deploy myAppRefId --tenant-alias example-alias --version 02

download

Downloads an app from App Hub to the specified directory.

wdcli app download charitableDonationsUserBuild_cqbvyp --latest-version

info

Displays app info for a specified app.

wdcli app info charitableDonationsUserBuild_cqbvyp

list

Displays apps of a given company.

wdcli app list cqbvyp

promote

Promotes a given application-version to the specified level. For Built on Workday Extend app promotion, producers can optionally use the --built-on-workday-version flag to set the version.

wdcli app promote charitableDonationsUserBuild_cqbvyp --level implementation

Note: App promotion with the Workday Developer CLI adheres to the same guidelines, best practices, and deadlines as the Developer Site. This includes specific promotion deadlines for Workday Extend apps with model components.

upload

Uploads the application to App Hub as specified by directory.

wdcli app upload

USAGE
  $ wdcli app upload [SOURCEDIRECTORY] [--no-build-wait] [--ci] [-f json|tabular] [-a <value> | ]

ARGUMENTS
  [SOURCEDIRECTORY]  Path to the app directory to upload.

FLAGS
  -a, --account=<value>  Account short ID
  -f, --format=<option>  Override the configured results format
                         <options: json|tabular>
      --ci               Enables continuous Integration mode, which does not allow interactivity
      --no-build-wait    Upload the app without waiting for the build to complete. A successful build is required to deploy to
                         a tenant. The default is to wait for the build to complete.

DESCRIPTION
  Uploads the app as specified by directory.

FLAG DESCRIPTIONS
  -a, --account=<value>  Account short ID

    Company short ID (overrides the default configured company, if any)

  -f, --format=json|tabular  Override the configured results format

    Override the configured results output format.

  --ci  Enables continuous Integration mode, which does not allow interactivity

    Turns on CI (Continuous Integration) settings. This automatically turns on --no-interactive to allow commands to fail fast


versions

Displays versions for a given app.

wdcli app versions charitableDonationsUserBuild_cqbvyp

Auth
login

Workday prompts you to log in and requires manual intervention to log in.

wdcli auth login

The WDCLI command to login as System User is:

wdcli auth login --system-user

logout

wdcli auth logout

Config
set

Sets a value for a given parameter. To see all parameters, use the --help flag.

wdcli config set defaultCompanyShortId abcdef

show

Shows current values for config parameters. To show all currently set parameters, leave arguments empty.

wdcli config show

General
help

Displays list and syntax of WDCLI commands.

wdcli help

version

Displays WDCLI version information.

wdcli version

whoami

Displays information about the current user and company.

wdcli whoami

Tenant
list

Displays all your registered tenants.

wdcli tenant list

login

Authenticates to Workday Extend for tenanted access.

wdcli tenant login my-alias

logout

Removes the locally stored tenanted access token.

wdcli tenant logout

open

Opens a tenant in your default browser.

wdcli tenant open example-tenant-alias

token

Displays the current Workday tenanted access token. Access is limited to only one tenant at a time and the new token overwrites any existing tenanted token.

wdcli tenant token