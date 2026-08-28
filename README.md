# AI Dev Squad

BUILD A PRODUCTION-GRADE MULTI-AGENT AI SOFTWARE DEVELOPMENT PLATFORM.
PROJECT NAME:
My AI Dev Team
IMPORTANT:
Do not build a simple chatbot.
Do not build a generic AI app builder.
Build a real GitHub-connected multi-agent software development platform.
The user will provide:
1. GitHub repository URL
2. GitHub Personal Access Token
3. One or more AI provider API keys
4. A natural-language development task
The platform must connect to the repository, inspect the actual codebase, understand the task, delegate work to specialized AI agents, safely modify the project, run tests, review the changes, and provide evidence before allowing a commit/push.
==================================================
1. CORE PRODUCT
==================================================
The application is an AI software development team.
The user gives ONE instruction.
Example:
"Redesign the dashboard, make it responsive, fix the loading problem and connect the existing API."
The system should NOT immediately edit files.
It must first:
1. Connect to GitHub.
2. Verify repository access.
3. Verify branch.
4. Inspect repository structure.
5. Read relevant project files.
6. Understand architecture.
7. Analyze the task.
8. Break the task into subtasks.
9. Assign subtasks to specialized agents.
10. Execute independent analysis tasks in parallel.
11. Coordinate implementation.
12. Run tests.
13. Review the changes.
14. Fix detected problems.
15. Run tests again.
16. Show the user the final changes.
17. Only then allow Commit + Push.
==================================================
2. ARCHITECTURE
==================================================
Use this architecture:
Frontend
↓
Backend / Edge Functions
↓
Agent Orchestrator
↓
Agent Runtime
↓
Sandboxed Workspace
↓
Git Repository
AI providers are abstracted behind a Model Provider Layer.
Do NOT hard-code the application to one AI provider.
Create a provider abstraction such as:
AIProvider
├── Gemini
├── OpenRouter
└── Future providers
The system must be able to switch providers without rewriting the agent system.
==================================================
3. AGENT ROLES
==================================================
Implement a multi-agent architecture.
Initial agents:
1. PROJECT MANAGER
2. ARCHITECT
3. FRONTEND DEVELOPER
4. BACKEND DEVELOPER
5. UI/UX REVIEWER
6. SECURITY REVIEWER
7. QA / TESTER
8. DEBUGGER
9. CODE REVIEWER
The Project Manager / Orchestrator coordinates the others.
Do not allow all agents to blindly edit the same files simultaneously.
Analysis agents may work in parallel.
Code modification must be coordinated through isolated workspaces, branches, patches, or another safe mechanism.
==================================================
4. PROJECT MANAGER AGENT
==================================================
Responsibilities:
- Understand user request.
- Understand repository.
- Identify affected areas.
- Break task into subtasks.
- Decide which agents are needed.
- Decide which tasks can run in parallel.
- Decide execution order.
- Collect agent results.
- Detect conflicts.
- Send implementation work to coding agents.
- Trigger QA.
- Trigger review.
- Decide whether another iteration is needed.
The Project Manager must NOT blindly trust other agents.
==================================================
5. ARCHITECT AGENT
==================================================
Before implementation:
- Inspect architecture.
- Identify relevant files.
- Identify dependencies.
- Identify existing implementations.
- Identify potential regressions.
- Recommend the smallest safe implementation.
Output:
ARCHITECTURE_REPORT
including:
- relevant files
- relevant functions/components
- dependencies
- risks
- proposed changes
- files that must not change
==================================================
6. UI/UX AGENT
==================================================
When a task affects UI:
The agent must inspect the existing UI before proposing changes.
It must identify:
- design language
- typography
- spacing
- colors
- buttons
- cards
- navigation
- responsive behavior
- RTL behavior
- existing patterns
Never instruct the coding agent to simply "make it professional."
UI specifications must describe:
- exact location
- hierarchy
- primary action
- secondary action
- text
- interaction
- loading state
- error state
- empty state
- mobile behavior
- desktop behavior
Do not invent a new design language if the repository already has one.
==================================================
7. CODING AGENT
==================================================
The coding agent is responsible for implementation.
Before editing:
- read relevant files completely
- understand dependencies
- identify existing functions
- avoid duplicate code
- preserve existing functionality
Rules:
MINIMAL SAFE CHANGE.
Do not rewrite the application unless explicitly requested.
Do not change frameworks without explicit authorization.
Do not replace providers without explicit authorization.
Do not delete existing functionality without explicit authorization.
==================================================
8. QA AGENT
==================================================
After implementation:
Run appropriate tests.
Check:
- syntax
- build
- runtime errors
- API errors
- invalid data
- loading states
- empty states
- error states
- responsive UI
- broken links
- duplicate behavior
- NaN
- undefined
- null
- wrong dates
- wrong locations
- wrong data
If tests fail:
return to DEBUGGER.
Do not declare success.
==================================================
9. SECURITY AGENT
==================================================
Inspect:
- secrets
- API keys
- tokens
- credentials
- environment variables
- exposed backend logic
- unsafe endpoints
- command execution
- path traversal
- arbitrary code execution
- unsafe Git operations
Secrets must NEVER appear in:
- frontend source
- Git commits
- logs
- agent messages
- screenshots
- generated reports
==================================================
10. GITHUB INTEGRATION
==================================================
The user provides:
Repository URL
GitHub Token
Branch
The platform must:
1. Validate the repository URL.
2. Validate the token.
3. Verify repository access.
4. Verify branch access.
5. Fetch repository metadata.
6. Clone/fetch the repository into an isolated workspace.
7. Never expose the token.
8. Never save the raw token in plaintext.
9. Never send the token to an AI model.
Use GitHub API and/or Git safely.
The token must only be used by the GitHub integration layer.
==================================================
11. REPOSITORY ACCESS UI
==================================================
Create a setup screen.
Title:
"Connect your repository"
Fields:
Repository URL
GitHub Token
Branch
AI Provider
API Key
Buttons:
"Test connection"
"Connect repository"
After successful connection:
show:
Repository
Branch
Last commit
Access status
Example:
✓ Repository connected
✓ Branch verified
✓ Write access verified
Never show the token itself.
==================================================
12. AI PROVIDER UI
==================================================
Create a provider management screen.
Provider options:
Gemini
OpenRouter
Future providers
For Gemini:
Gemini API Key
For OpenRouter:
OpenRouter API Key
Allow the user to select:
Primary model
Fallback model
The system must support provider fallback.
Example:
Gemini
↓ failure/rate limit
OpenRouter free model
↓ failure
Configured fallback
Do not silently switch to a paid model.
==================================================
13. FREE MODEL SUPPORT
==================================================
Support OpenRouter's free model routing.
Default free route:
openrouter/free
Allow the user to select a specific free model when available.
Do not assume free models are unlimited.
Track:
requests
errors
rate limits
provider
model
tokens when available
If a free model is unavailable:
show a clear message and use another configured provider only if the user has enabled fallback.
==================================================
14. GEMINI SUPPORT
==================================================
Support Gemini as a first-class provider.
Do not hard-code obsolete model IDs.
Model IDs must be configurable.
The provider layer must allow model changes without rewriting agent logic.
==================================================
15. AGENT DASHBOARD
==================================================
After the user submits a task, show a live task dashboard.
Layout:
TOP:
Project
Repository
Branch
Task status
CENTER:
Agent activity
RIGHT / SIDE:
Task details and changes
Agent cards:
PROJECT MANAGER
ARCHITECT
UI/UX
DEVELOPER
SECURITY
QA
REVIEWER
Each card shows:
Status
Thinking/working state
Current subtask
Files touched
Result
Errors
Statuses:
WAITING
RUNNING
COMPLETED
FAILED
BLOCKED
REVIEW_REQUIRED
==================================================
16. TASK TIMELINE
==================================================
Show a timeline:
Repository connected
↓
Repository analyzed
↓
Task planned
↓
Architect completed
↓
UI analysis completed
↓
Implementation started
↓
Tests running
↓
Review
↓
Fixes
↓
Final verification
The user must be able to understand what the system is doing.
==================================================
17. PARALLEL AGENTS
==================================================
Parallelize only independent work.
Example:
ARCHITECT
UI/UX
SECURITY
may run simultaneously.
But:
CODER
and
CODER
must NOT blindly modify the same files simultaneously.
Use isolated workspaces/branches/patches when parallel implementation is required.
Merge only after conflict detection and review.
==================================================
18. WORKSPACE ISOLATION
==================================================
Every task must run in an isolated workspace.
Never allow an agent to corrupt the user's original repository directly.
Suggested flow:
Repository
↓
Task Workspace
↓
Agent changes
↓
Tests
↓
Review
↓
Patch / Commit
↓
User approval
↓
Push
==================================================
19. COMMAND EXECUTION
==================================================
Agents may need:
- shell
- file read
- file write
- search
- git
- test
- build
Command execution must be sandboxed.
Do not expose arbitrary server filesystem access.
Prevent:
- path traversal
- access outside workspace
- destructive commands outside workspace
Dangerous commands must be blocked or require explicit approval.
==================================================
20. FILE OPERATIONS
==================================================
Provide tools:
read_file
write_file
edit_file
search_files
list_files
run_command
run_tests
git_diff
git_status
git_commit
git_push
Every operation must be logged.
==================================================
21. AGENT MEMORY
==================================================
Create Project Memory.
Store:
PROJECT BLUEPRINT
ARCHITECTURE SUMMARY
DECISIONS
ERROR LOG
PREVIOUS TASKS
LESSONS
CURRENT STATE
LAST COMMIT
KNOWN PROBLEMS
The system must not rediscover the entire project unnecessarily on every task.
Memory must be scoped per project.
==================================================
22. ERROR LOG
==================================================
Every failure becomes a structured lesson.
Format:
Failure
Cause
Evidence
Fix
Lesson
Future Rule
Example:
Failure:
Service Worker served old build.
Cause:
Cache version was not updated.
Lesson:
PWA changes require cache invalidation.
Future Rule:
Increment cache version on PWA releases.
==================================================
23. TASK MEMORY
==================================================
Each completed task stores:
Task ID
User request
Plan
Agents used
Files changed
Tests
Failures
Fixes
Commit
Result
Future agents can read this context.
==================================================
24. USER APPROVAL
==================================================
The system must support approval gates.
At minimum:
Before Push
show:
Files changed
Diff summary
Tests
Security result
Review result
Buttons:
"Approve & Push"
"Reject"
"Ask Agents to Fix"
Never push silently unless the user explicitly enables Auto Push mode.
==================================================
25. DIFF VIEW
==================================================
Create a proper diff screen.
Show:
file path
added lines
removed lines
changed lines
Allow filtering by agent.
Example:
Frontend Agent
3 files
Backend Agent
2 files
Security Agent
0 changes
==================================================
26. FINAL REVIEW
==================================================
Before Commit/Push:
CODE REVIEWER must inspect:
- correctness
- regressions
- duplication
- security
- maintainability
- UI consistency
- tests
Then QA must pass.
Only after both pass:
READY TO COMMIT
==================================================
27. COMMIT UI
==================================================
Show:
Commit message
Files changed
Tests passed
Review passed
Security passed
Button:
"Commit changes"
Then:
"Push to main"
or the selected branch.
==================================================
28. ROLLBACK
==================================================
Support safe rollback.
The user must be able to:
- discard task workspace
- revert unpushed changes
- restore previous task state
Never destroy the original repository without explicit confirmation.
==================================================
29. OBSERVABILITY
==================================================
Show:
Agent logs
Task logs
Errors
Provider
Model
Latency
Token usage when available
Git operations
Test results
Do not show secrets.
==================================================
30. FAILURE HANDLING
==================================================
If an agent fails:
Do not terminate the entire task immediately.
Determine:
Is the failure recoverable?
If yes:
retry with corrected context.
If no:
mark the agent FAILED.
Ask another agent to diagnose.
Example:
Coder failed
↓
Debugger analyzes
↓
Coder retries
↓
QA
==================================================
31. RATE LIMIT HANDLING
==================================================
Provider rate limits must be detected.
If Gemini reaches a limit:
Use configured fallback provider/model.
If OpenRouter free reaches its limit:
Do not pretend the request succeeded.
Show:
"Free model rate limit reached."
Allow:
Retry later
Use another configured provider
Stop task
==================================================
32. NO PAID SURPRISES
==================================================
NEVER automatically route to a paid model.
If the user configured only free providers:
stay free.
If all free providers fail:
stop and explain.
==================================================
33. SECURITY OF USER CREDENTIALS
==================================================
Never put:
GitHub Token
Gemini API Key
OpenRouter API Key
inside frontend source code.
Use secure server-side secrets.
Do not place credentials in:
Git commits
logs
agent prompts
database plaintext
browser localStorage
==================================================
34. PROJECT MEMORY SECURITY
==================================================
Never store:
raw GitHub token
raw API keys
inside Project Memory.
Store only:
provider name
configuration metadata
masked identifier if needed
==================================================
35. UI DESIGN
==================================================
The interface should feel like a professional developer command center.
Not like a generic chatbot.
Primary areas:
1. Projects
2. Repository
3. Task
4. Agents
5. Changes
6. Tests
7. Memory
8. Settings
Visual hierarchy:
Project
↓
Current Task
↓
Agent Team
↓
Changes
↓
Validation
↓
Commit / Push
Use a clean professional developer-tool aesthetic.
Do not overuse cards.
Do not create unnecessary animations.
The interface must remain understandable during long-running tasks.
==================================================
36. MAIN DASHBOARD
==================================================
Header:
My AI Dev Team
Project selector
Connection status
Provider status
Main area:
CURRENT PROJECT
Repository
Branch
Last commit
CURRENT TASK
Task description
Progress
AGENTS
Agent statuses
ACTIVITY
Live timeline
BOTTOM:
Tests
Changes
Review
Commit status
==================================================
37. MOBILE
==================================================
The application must be responsive.
On mobile:
- Agent cards stack vertically.
- Logs become collapsible.
- Diff becomes horizontally scrollable.
- Bottom actions remain accessible.
- No horizontal page overflow.
Primary action must remain visible.
==================================================
38. EMPTY STATES
==================================================
Projects empty:
"No projects connected yet."
Button:
"Connect repository"
No active task:
"No active task."
Button:
"Start a task"
No agents running:
"Agents are ready."
==================================================
39. ERROR STATES
==================================================
Repository error:
"Could not connect to this repository."
Show:
Retry
Check credentials
Check repository
Provider error:
"AI provider unavailable."
Show configured fallback status.
Never show raw secrets or internal credentials.
==================================================
40. TASK INPUT
==================================================
The task input must support long natural-language instructions.
Placeholder:
"What do you want the team to build or fix?"
Examples:
"Redesign the dashboard and make it mobile responsive."
"Fix the broken map and test the API."
"Add an AI assistant that understands the current trip."
"Review the project for security problems."
==================================================
41. TASK PLANNING PREVIEW
==================================================
Before implementation, show:
TASK PLAN
Goal
Affected areas
Agents selected
Parallel tasks
Sequential tasks
Potential risks
Estimated operations
Buttons:
"Start"
"Edit plan"
==================================================
42. IMPORTANT: DO NOT OVER-AUTOMATE
==================================================
The system must not make architectural decisions blindly.
When uncertainty is high:
ASK FOR CLARIFICATION
or
create an INSPECTION task first.
Never invent:
file names
APIs
functions
components
architecture
database schema
==================================================
43. INSPECTION-FIRST MODE
==================================================
If the repository is unfamiliar:
First task:
AUDIT REPOSITORY
Return:
- stack
- architecture
- important files
- entry points
- API layer
- data layer
- tests
- build system
- deployment
- risks
Then plan implementation.
==================================================
44. TESTING
==================================================
Every implementation task must attempt appropriate:
- syntax check
- lint
- unit tests
- integration tests
- build
- runtime verification
Use tests that actually exist in the repository when possible.
Do not invent successful test results.
==================================================
45. EVIDENCE
==================================================
Every completed task must produce:
Repository
Branch
Commit
Files changed
Tests
Build result
Security result
Agent review
Production status if applicable
Never say:
"Done"
without evidence.
==================================================
46. GIT SAFETY
==================================================
Before commit:
git status
git diff
git diff --check
Review changed files.
Never commit:
.env
secrets
tokens
credentials
generated private files
unless explicitly intended and safe.
==================================================
47. PRODUCTION VERIFICATION
==================================================
If the repository has a deployment:
After successful implementation:
verify production.
Do not consider local success equivalent to production success.
==================================================
48. PROJECT CONTEXT IMPORT
==================================================
Allow the user to paste:
MASTER PROJECT BLUEPRINT
ERROR LOG
PROJECT NOTES
These become Project Memory.
Provide an import screen:
"Project Context"
Textarea
"Save Project Context"
The context should be attached to future tasks.
==================================================
49. AGENT CONFIGURATION
==================================================
Allow configuration:
Agent Name
Role
Provider
Model
Temperature if supported
Tools
Permissions
Max iterations
Parallel allowed
Write access
Command access
Default permissions:
Architect:
Read only
UI/UX:
Read only
Security:
Read only
Reviewer:
Read only
QA:
Read + Execute
Coder:
Read + Write + Execute
Project Manager:
Orchestration only
==================================================
50. PERMISSION MODEL
==================================================
Agents must have explicit capabilities.
Example:
READ
WRITE
EXECUTE
GIT
NETWORK
Never give every agent every permission.
Principle:
LEAST PRIVILEGE.
==================================================
51. MODEL ROUTING
==================================================
Create a Model Router.
Input:
Task type
Complexity
Agent role
Provider availability
Rate limit
Output:
Selected model
Examples:
Architecture:
Reasoning model
Coding:
Coding model
Simple QA:
Fast model
Security:
Reasoning model
UI:
Vision/reasoning model when needed
Do not hard-code the same model for every agent.
==================================================
52. FREE-FIRST ROUTING
==================================================
Default strategy:
1. User-configured free Gemini access.
2. User-configured OpenRouter free model.
3. Other explicitly configured free provider.
4. Stop if no free provider remains.
Never silently use paid inference.
==================================================
53. MULTI-AGENT RESULT FORMAT
==================================================
Each agent returns structured data:
agent
task
status
summary
files_read
files_changed
findings
risks
tests
recommendation
The orchestrator consumes structured results rather than raw text only.
==================================================
54. CONFLICT RESOLUTION
==================================================
If two agents modify overlapping files:
Do not blindly merge.
Trigger:
CONFLICT REVIEW
Then:
Reviewer
+
Architect
decide which changes survive.
==================================================
55. AGENT CHAT
==================================================
Allow the user to inspect an agent.
Example:
ARCHITECT
User can ask:
"Why did you choose this architecture?"
The agent answers using its task context.
But agent chat must not bypass permissions.
==================================================
56. TASK HISTORY
==================================================
Show:
Previous Tasks
Task #001
Repository Audit
Task #002
Dashboard redesign
Task #003
API integration
Each task contains:
Plan
Agents
Changes
Tests
Commit
Result
==================================================
57. DO NOT BUILD A FAKE DEMO
==================================================
This is critical.
Do not create UI that pretends agents are working if no agents are actually running.
Do not show fake:
"Analyzing..."
"Testing..."
"Completed..."
unless those operations actually happened.
All statuses must be connected to real backend task state.
==================================================
58. IMPLEMENTATION STRATEGY
==================================================
Build this application incrementally.
PHASE 1:
Authentication and secure project connection.
PHASE 2:
GitHub repository inspection.
PHASE 3:
Single coding agent.
PHASE 4:
Agent tool system.
PHASE 5:
Project Manager.
PHASE 6:
Multi-agent delegation.
PHASE 7:
Parallel analysis.
PHASE 8:
Sandboxed code execution.
PHASE 9:
Testing and review.
PHASE 10:
Git commit/push.
PHASE 11:
Project memory.
PHASE 12:
Provider fallback.
Do not pretend all phases are complete after generating UI.
Each phase must be functional before moving to the next.
==================================================
59. FIRST IMPLEMENTATION
==================================================
Start with PHASE 1 only.
Build:
- professional dashboard shell
- secure project connection UI
- GitHub repository URL
- GitHub token secret input
- branch selector/input
- provider selector
- Gemini API key secret input
- OpenRouter API key secret input
- connection test
- project state
- secure secret storage
- clear errors
- no fake agent activity
Then verify it works.
Do NOT implement fake multi-agent execution in Phase 1.
==================================================
60. IMPORTANT LOVABLE RULE
==================================================
Use Lovable's secure server-side integration pattern.
Sensitive credentials must be stored as secrets and used by backend/Edge Functions.
Do not put:
GITHUB_TOKEN
GEMINI_API_KEY
OPENROUTER_API_KEY
in frontend code.
Do not put them in localStorage.
Do not send them to the browser after storage.
==================================================
61. FINAL PRODUCT
==================================================
The final product should feel like:
"An AI software engineering team that I control."
Not:
"Another chatbot."
The user should be able to:
Connect repository
↓
Describe task
↓
Watch team plan
↓
Watch agents collaborate
↓
Review changes
↓
Run tests
↓
Approve
↓
Commit
↓
Push
==================================================
62. QUALITY BAR
==================================================
Do not optimize for:
number of screens.
Optimize for:
REAL FUNCTIONALITY.
Do not implement fake agents.
Do not fake GitHub connection.
Do not fake API calls.
Do not fake tests.
Do not fake commits.
Do not claim success without evidence.
Build the platform incrementally and verify every phase before continuing.
==================================================
63. FINAL ACCEPTANCE CRITERIA
==================================================
The application is considered functional only when:
1. User can securely connect a real GitHub repository.
2. Repository access is actually verified.
3. Repository files can actually be inspected.
4. A real task can be submitted.
5. A real AI agent can analyze the repository.
6. The agent can make controlled changes.
7. Tests can actually run.
8. A reviewer can inspect changes.
9. Git diff is real.
10. Commit is real.
11. Push is real.
12. No secrets are exposed.
13. Project memory persists.
14. Multi-agent delegation works for real.
15. Parallel agents use safe isolation.
16. Provider fallback works only with configured providers.
17. Free mode never silently incurs paid model usage.
18. Errors are visible and recoverable.
19. The UI never pretends an operation succeeded when it did not.
20. The system remains usable on mobile.
IMPORTANT:
Do not attempt to satisfy all acceptance criteria with mock data.
Build the actual system incrementally.
Start with Phase 1.
After Phase 1 is verified, continue to the next phase only when the implementation is stable.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://dev-copilot-crew.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a524f6ab-54f4-4b8b-906f-c8880732296a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
