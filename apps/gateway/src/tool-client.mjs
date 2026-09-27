// Run inside the Grok Bot computer. The webhook body supplies these job-only values.
const [base, name, payload='{}']=process.argv.slice(2);
if(!base?.startsWith('https://')||!name?.match(/^[a-z_]+$/)||!process.env.EXITNOW_JOB_TOKEN)throw Error('Usage: EXITNOW_JOB_TOKEN=<job token> node tool-client.mjs <HTTPS toolBaseUrl> <tool_name> <JSON>');
const response=await fetch(`${base}/${name}`,{method:'POST',headers:{authorization:`Bearer ${process.env.EXITNOW_JOB_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(JSON.parse(payload)),signal:AbortSignal.timeout(20000)});
console.log(await response.text());if(!response.ok)process.exitCode=1;
