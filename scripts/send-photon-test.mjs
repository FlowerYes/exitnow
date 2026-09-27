import {Spectrum} from 'spectrum-ts';
import {imessage} from 'spectrum-ts/providers/imessage';
const recipient=process.env.EXITNOW_TEST_RECIPIENT;
if(!recipient||!/^\+[1-9]\d{7,14}$/.test(recipient))throw Error('Set EXITNOW_TEST_RECIPIENT to the explicitly authorized international test number');
const app=await Spectrum({projectId:process.env.SPECTRUM_PROJECT_ID,projectSecret:process.env.SPECTRUM_PROJECT_SECRET,providers:[imessage.config()],telemetry:false});
try{const provider=imessage(app);const user=await provider.user(recipient);const dm=await provider.space.create(user);await dm.send("ExitNow connection test. Reply ‘Plan a demo trip from Court Square to Downtown Brooklyn’ to test journey guidance. Routes are currently synthetic demo data.");console.log(JSON.stringify({submitted:true,deliveryConfirmed:false,recipient:'[redacted]'}));}finally{await app.stop()}
