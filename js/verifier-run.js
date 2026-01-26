// js/verifier-run.js
import { verifyModules } from './verifier.js';

verifyModules().then(results => {
    console.log('Verification complete:', results);
});
