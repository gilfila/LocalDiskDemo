#!/usr/bin/env node
// Workday Developer Agent MCP Server
// Exposes Workday Extend development knowledge as a single tool.

process.stdin.setEncoding('utf8');

const TOOLS = [
  {
    name: 'workday_developer_agent',
    description:
      'Workday Extend Developer Agent — returns authoritative patterns, file formats, widget reference, orchestration rules, and deployment guidance for Workday Extend applications. Call this tool before writing or modifying any PMD, AMD, SMD, orchestration, businessobject, or businessprocess file.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Describe what you need to build or what pattern/format you need help with',
        },
        topic: {
          type: 'string',
          enum: ['pmd', 'amd', 'smd', 'orchestration', 'scripting', 'businessobject', 'businessprocess', 'deployment', 'general'],
          description: 'Optional topic filter',
        },
      },
      required: ['query'],
    },
  },
];

// ─── Knowledge Base ──────────────────────────────────────────────────────────

const KNOWLEDGE = {
  general: `
# Workday Extend Developer Agent

## Platform Overview
Workday Extend is a platform for building custom applications on top of Workday. Apps consist of:
- PMD pages (UI)
- AMD + SMD app configuration
- Orchestration workflows
- Business Objects and Business Processes
- Scripts (.script files)

This is a **Local Disk** project — files sync directly to the Workday tenant via:
  wdcli app validate
  wdcli app deploy
  wdcli app preview

There is NO Workday Studio configuration step.

## Reference Files (always read before guessing)
Base: /Users/tony.gilfillan/Documents/GitHub/workdayBuildAgent/

| Need | Location |
|------|----------|
| Widget types & page layouts | pmdWidgetDictionary/presentation/*.pmd |
| Cards | pmdWidgetDictionary/presentation/cards/*.card |
| Pods | pmdWidgetDictionary/presentation/pods/*.pod |
| Charts | pmdWidgetDictionary/presentation/projectPlanning.pmd |
| Flow & task definitions | pmdWidgetDictionary/presentation/pmdWidgetDictionary.amd |
| Site metadata | pmdWidgetDictionary/presentation/pmdWidgetDictionary.smd |
| Scripting — page events | pmdScripting/presentation/pageEvents.pmd + scripts/pageEvents.script |
| Scripting — grid events | pmdScripting/presentation/gridEvents.pmd + scripts/gridEvents.script |
| Scripting — endpoint invocation | pmdScripting/presentation/invokingEndpoints.pmd + scripts/invokingEndpoints.script |
| Scripting — data manipulation | pmdScripting/presentation/dataManipulation.pmd + scripts/dataManipulation.script |
| Scripting — date calculations | pmdScripting/presentation/dateCalculations.pmd + scripts/dateCalculations.script |
| Orchestration sub-flows | orchestrateStarterKit/orchestration/*.suborchestration |
| Error handling | orchestrateStarterKit/orchestration/OSK141_*.suborchestration |
| Additional docs & forum content | /Users/tony.gilfillan/Desktop/Documentation and Forum Content |
`,

  pmd: `
# PMD (Page Metadata) Reference

## Page Structure
\`\`\`json
{
  "id": "pageName",
  "endPoints": [],
  "presentation": {
    "title": { "type": "title", "label": "Page Title" },
    "body": { "type": "section", "horizontal": false, "children": [] },
    "footer": { "type": "footer", "children": [] }
  }
}
\`\`\`

## Page Type Variants
- Standard read-only: omit pageType
- Edit/form: "pageType": "edit"
- Confirmation: "pageType": "confirm"
- Popup overlay: "micro": true

## Valid Widget Types
Form controls: text, textArea, number, date, time, datetime, boolean, select, instanceList, radio, checkBox, checkBoxList
Layout: section, grid, column, tabs, accordion, panel
Navigation: button, link
Display: title, richText, readOnlyText, image, icon
Footer: footer

## CRITICAL RULES
- enabled and visible MUST be boolean (true/false) or an EL expression string — NEVER the strings "true"/"false"
- Use == and != in expressions, NOT === or !==
- checkBoxList values MUST be an EL expression: "<% [{ id: 'x', descriptor: 'Label' }] %>" — NOT a JSON array
- Widget type for year/numeric input is "number", NOT "numeric"
- Buttons MUST have a taskReference or workdayTaskReference

## Endpoints
\`\`\`json
{
  "name": "myData",
  "baseUrlType": "orchestration",
  "url": "myOrchestration/launch",
  "httpMethod": "post",
  "authType": "sso",
  "deferred": false,
  "onSend": "<% self.data = { workerId: currentUser.id }; %>"
}
\`\`\`
- deferred: false = loads on page load
- deferred: true = invoked from script
- baseUrlType: "orchestration" for orchestrations (key must be declared in AMD dataProviders)
- baseUrlType: "workday-staffing" for Staffing API
- baseUrlType: "workday-common" for Common API

## Grid Pattern
\`\`\`json
{
  "type": "grid",
  "id": "myGrid",
  "rows": "<% endpointData.items %>",
  "rowVariableName": "row",
  "columns": [
    {
      "type": "column",
      "columnId": "nameCol",
      "label": "Name",
      "cellTemplate": { "type": "readOnlyText", "value": "<% row.name %>" }
    }
  ]
}
\`\`\`

## Outbound Variables (multi-step flows)
\`\`\`json
{
  "outboundData": {
    "outboundEndPoints": [{
      "name": "toNextStep",
      "type": "outboundVariable",
      "variableScope": "flow",
      "values": [
        { "outboundPath": "fieldName", "value": "<% widget.value %>" }
      ]
    }]
  }
}
\`\`\`
Read in the target step with: flowVariables.fieldName
`,

  amd: `
# AMD (Application Metadata) Reference

\`\`\`json
{
  "appProperties": [],
  "flowDefinitions": [
    {
      "id": "myFlow",
      "flowSteps": [
        { "id": "step1", "startsFlow": true, "taskId": "page1",
          "transitions": [{ "order": "a", "value": "step2", "condition": "true" }] },
        { "id": "step2", "endsFlow": true, "taskId": "page2" }
      ]
    }
  ],
  "tasks": [
    { "id": "home", "routingPattern": "/", "page": { "id": "home" } },
    { "id": "page1", "routingPattern": "/flow/step1", "page": { "id": "page1" } },
    { "id": "page2", "routingPattern": "/flow/step2", "page": { "id": "page2" } }
  ],
  "dataProviders": [
    { "key": "workday-staffing", "value": "<% apiGatewayEndpoint + '/staffing/v1' %>" },
    { "key": "workday-common", "value": "<% apiGatewayEndpoint + '/common/v1' %>" },
    { "key": "orchestration", "value": "<% \`{{apiGatewayEndpoint}}/orchestrate/v1/apps/{{site.applicationId}}/orchestrations/\` %>" }
  ],
  "applicationId": "myApp"
}
\`\`\`

## CRITICAL RULES
- Every task MUST have routingPattern and page — no task can use "flow" as a property
- Flow step pages still need their own task entries with routingPattern
- "orchestrate" is NOT a valid baseUrlType key — use "orchestration" and declare it in dataProviders
- flowDefinitions uses startsFlow/endsFlow (not isStartStep)
`,

  smd: `
# SMD (Site Metadata) Reference

\`\`\`json
{
  "id": "myApp",
  "siteId": "myApp",
  "applicationId": "myApp",
  "languages": ["en-US"],
  "siteAuth": {
    "authTypes": [
      { "scheme": "SSO", "id": "sso" },
      { "scheme": "NoAuth", "id": "noauth" }
    ]
  },
  "cdnEnabled": false
}
\`\`\`
`,

  scripting: `
# Scripting Reference

## Script File Structure
\`\`\`javascript
var myFunction = function() {
  // logic here
};

{
  "myFunction": myFunction
}
\`\`\`

## CRITICAL: Valid Operators
- Use == and != (NOT === or !==)
- && and || are valid
- empty(value) checks null/empty

## Widget Access
\`\`\`javascript
widgetId.value
widgetId.visible = true
widgetId.setError('message')
widgetId.clearError()
gridId.setRows(data)
gridId.selectedRows[0].childrenMap.colId.value
\`\`\`

## Endpoint Invocation
\`\`\`javascript
var result = endpointName.invoke({ param: value });
result.data
\`\`\`

## Data Operations
\`\`\`javascript
array.map(item => { 'key': item.field })
array.filter(item => { item.active == true })
array.sort(item => { item.name })
empty(value)
\`\`\`

## Date Operations
\`\`\`javascript
date:getTodaysDate(date:getDateTimeZone('America/Los_Angeles'))
date:add(date, 'DAY', 5)
date:format(date, 'yyyy-MM-dd')
date:after(date2, date1)
\`\`\`

## Variables
\`\`\`javascript
pageVariables.myVar = data
flowVariables.fromPreviousStep
\`\`\`

## Logging
\`\`\`javascript
console.info('msg', variable)
console.debug('msg', variable)
\`\`\`
`,

  businessobject: `
# BusinessObject Reference

File extension: .businessobject

\`\`\`json
{
  "id": 1,
  "name": "MyObject",
  "label": "My Object",
  "defaultSecurityDomains": [],
  "defaultCollection": {
    "name": "myObjects",
    "label": "My Objects"
  },
  "fields": [
    { "id": 1, "name": "workerId", "type": "TEXT", "label": "Worker ID", "isReferenceId": true, "useForDisplay": true },
    { "id": 2, "name": "status", "type": "TEXT", "label": "Status" },
    { "id": 3, "name": "count", "type": "INTEGER", "label": "Count" },
    { "id": 4, "name": "isActive", "type": "BOOLEAN", "label": "Is Active" }
  ]
}
\`\`\`

## CRITICAL: Valid Field Types ONLY
- TEXT — strings, dates stored as strings, IDs
- INTEGER — whole numbers
- BOOLEAN — true/false
- SINGLE_INSTANCE — reference to another object

DO NOT USE: NUMERIC, DECIMAL, NUMBER, DATE, DATETIME — these are invalid and will fail validation.
Store dates as TEXT fields.

## Field Properties
- id: sequential integer starting at 1
- name: camelCase identifier
- type: TEXT | INTEGER | BOOLEAN | SINGLE_INSTANCE
- label: human-readable
- isReferenceId: true/false (marks the primary identifier field)
- useForDisplay: true/false
- description: optional string
`,

  businessprocess: `
# BusinessProcess Reference

File extension: .businessprocess

\`\`\`json
{
  "id": 1,
  "name": "MyApproval",
  "label": "My Approval",
  "targetBusinessObject": "MyObject",
  "useForOrchestrate": false,
  "allowsCancel": false,
  "approvalStep": {
    "actions": ["APPROVE", "DENY", "SEND_BACK"]
  },
  "actionSteps": []
}
\`\`\`

Valid actions: APPROVE, DENY, SEND_BACK
`,

  orchestration: `
# Orchestration Reference

File extension: .orchestration

## Key Step Types
| Type | Purpose |
|------|---------|
| Create Values | Assign/compute variables |
| Create Text Template | Build text or JSON strings |
| Loop | Iterate collections |
| Branch On Conditions | Conditional logic |
| Call Subflow | Call another orchestration |
| Send Integration Message | Log/notify |
| Validate | Validate conditions |

## CRITICAL: No Self-Referential Steps
A step CANNOT reference its own outputs within the same step.
Split into two steps: one to compute, one to use the result.

## Starter Kit Reference (OSK###)
| Range | Purpose |
|-------|---------|
| OSK100-113 | Settings, data, document ops, SOAP, imports |
| OSK141-144 | Error handling and logging |

All starter kit orchestrations are in:
/Users/tony.gilfillan/Documents/GitHub/workdayBuildAgent/orchestrateStarterKit/orchestration/
`,

  deployment: `
# Deployment Reference

This is a Local Disk Workday Extend project — NO Workday Studio configuration.

## wdcli Commands
\`\`\`bash
wdcli app validate     # validate all files
wdcli app deploy       # sync to tenant
wdcli app preview      # open preview in browser
wdcli app upload       # upload artifacts
wdcli auth login       # authenticate
wdcli tenant           # show current tenant
wdcli whoami           # show current user
\`\`\`

Always validate before deploying.

## MCP Tools Available (workday-extend-mcp)
- validateApp — validate app structure
- createApp — scaffold new app
- addComponent — add page/flow/task to existing app
- askExtendCopilot — ask Workday Extend AI
- login — authenticate to tenant
- listResources / readResource — browse tenant resources
- listCompanies / switchCompany — manage tenant context
- verifyProjectCompany — verify correct tenant
`,
};

function getGuidance(query, topic) {
  const q = (query || '').toLowerCase();

  // If topic provided, return that section + general
  if (topic && KNOWLEDGE[topic]) {
    return KNOWLEDGE.general + '\n\n' + KNOWLEDGE[topic];
  }

  // Auto-detect topic from query
  const sections = [KNOWLEDGE.general];

  if (q.includes('pmd') || q.includes('page') || q.includes('widget') || q.includes('button') ||
      q.includes('grid') || q.includes('form') || q.includes('endpoint') || q.includes('visible') || q.includes('enabled')) {
    sections.push(KNOWLEDGE.pmd);
  }
  if (q.includes('amd') || q.includes('task') || q.includes('routing') || q.includes('flow') || q.includes('dataprovider')) {
    sections.push(KNOWLEDGE.amd);
  }
  if (q.includes('smd') || q.includes('site')) {
    sections.push(KNOWLEDGE.smd);
  }
  if (q.includes('script') || q.includes('function') || q.includes('invoke') || q.includes('===') || q.includes('operator')) {
    sections.push(KNOWLEDGE.scripting);
  }
  if (q.includes('business object') || q.includes('businessobject') || q.includes('.businessobject') ||
      q.includes('field type') || q.includes('integer') || q.includes('numeric')) {
    sections.push(KNOWLEDGE.businessobject);
  }
  if (q.includes('business process') || q.includes('businessprocess') || q.includes('.businessprocess') || q.includes('approval')) {
    sections.push(KNOWLEDGE.businessprocess);
  }
  if (q.includes('orchestrat')) {
    sections.push(KNOWLEDGE.orchestration);
  }
  if (q.includes('deploy') || q.includes('wdcli') || q.includes('validate') || q.includes('sync') || q.includes('upload')) {
    sections.push(KNOWLEDGE.deployment);
  }

  // If nothing matched, return everything
  if (sections.length === 1) {
    return Object.values(KNOWLEDGE).join('\n\n---\n\n');
  }

  return [...new Set(sections)].join('\n\n---\n\n');
}

// ─── MCP Protocol ────────────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function handle(msg) {
  // Notifications have no id — no response needed
  if (msg.id === undefined || msg.id === null) return;

  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'workday-developer-agent', version: '1.0.0' },
      },
    });
    return;
  }

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    if (name === 'workday_developer_agent') {
      const text = getGuidance(args.query, args.topic);
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text }] },
      });
      return;
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Tool not found' } });
    return;
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
}

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      try { handle(JSON.parse(trimmed)); } catch (_) {}
    }
  }
});

process.stdin.on('end', () => process.exit(0));
