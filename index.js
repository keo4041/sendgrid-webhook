const functions = require('@google-cloud/functions-framework');
const { Firestore } = require('@google-cloud/firestore');
const { EventWebhook, EventWebhookHeader } = require('@sendgrid/eventwebhook');
// No need to import PublicKey from 'starkbank-ecdsa' directly here anymore for the main flow

const firestore = new Firestore({
  projectId: process.env.GCP_PROJECT
});


const SENDGRID_PEM_KEY_STRING = process.env.SENDGRID_PUBLIC_KEY; // Renamed for clarity

functions.http('helloHttp', async (req, res) => {
  if (typeof SENDGRID_PEM_KEY_STRING !== 'string' || SENDGRID_PEM_KEY_STRING.trim() === '') {
    console.error('CRITICAL_CONFIG: SendGrid PEM key string is missing or empty.');
    res.status(500).send('Server Misconfiguration: Public key not available. Events not processed.');
    return;
  }
  
  //check req user agent or any information about the requestor and their identity for snedgrid
  

  // User-Agent Check (Consider making this case-insensitive and checking for ua existence)
  const ua = req.headers['user-agent'];
  const expectedUa = "SendGrid Event API"; // Consistent variable name
  // console.log(`User-Agent: ${ua}`);
  // console.log(`Request Headers: ${JSON.stringify(req.headers)}`);

  // A more robust User-Agent check:
  if (!ua || ua.toLowerCase() !== expectedUa.toLowerCase()) {
    console.warn(`Warning: User-Agent mismatch or missing. Expected: '${expectedUa}', Got: '${ua}'. Processing continues but review if this is a legitimate SendGrid request or a test.`);
    // Depending on your security policy, you might decide to block here.
    // For now, let's assume it might be a test request and proceed, but log it.
    // If you want to strictly enforce:
    //   console.warn('Blocked: Invalid User-Agent', ua);
    //   res.status(403).send('Forbidden: Invalid User-Agent.');
    //   return;
  }

//   console.log("Using SendGrid PEM Key String (for conversion):");
//   console.log(JSON.stringify(SENDGRID_PEM_KEY_STRING));
//   console.log("--- End of PEM Key String Log ---");

  const eventWebhook = new EventWebhook(); // Instantiate the helper

  // 1. Convert PEM string to ECDSA PublicKey object using the library's method
  let ecdsaPublicKeyObject;
  try {
    ecdsaPublicKeyObject = eventWebhook.convertPublicKeyToECDSA(SENDGRID_PEM_KEY_STRING);
    console.log('Success: PEM string converted to ECDSA PublicKey object.');
    // You can add a check here for ecdsaPublicKeyObject.curve.N if needed for deeper debugging
    // Optional: Deep inspection of the PublicKey object structure if needed for debugging
    // console.log('PublicKey object details:', {
    //     curve: ecdsaPublicKeyObject.curve ? {
    //         name: ecdsaPublicKeyObject.curve.name,
    //         N: ecdsaPublicKeyObject.curve.N, // This is a BigNumber, difficult to inspect directly
    //         p: ecdsaPublicKeyObject.curve.p,
    //         a: ecdsaPublicKeyObject.curve.a,
    //         b: ecdsaPublicKeyObject.curve.b,
    //         G: ecdsaPublicKeyObject.curve.G,
    //         n: ecdsaPublicKeyObject.curve.n,
    //         h: ecdsaPublicKeyObject.curve.h
    //     } : null,
    //     point: ecdsaPublicKeyObject.point
    // });
    
    if (!(ecdsaPublicKeyObject && ecdsaPublicKeyObject.curve && ecdsaPublicKeyObject.curve.N)) {
        console.error('ERROR_CONVERT_KEY: Converted PublicKey object is missing curve or N parameter.');
        res.status(500).send('Internal Server Error: Failed to properly initialize public key object. Check server logs.');
        return;
    }
  } catch (e) {
    console.error('CRITICAL_KEY_CONVERSION_EXCEPTION: Exception during eventWebhook.convertPublicKeyToECDSA:', e);
    console.error('PEM Key String that caused failure (first 60 chars):', SENDGRID_PEM_KEY_STRING.substring(0,60) + "...");
    res.status(500).send('Internal Server Error: Exception during public key conversion. Check server logs.');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method Not Allowed');
    return;
  }

  if (!req.is('application/json')) {
    res.status(415).send('Unsupported Media Type: Expecting application/json');
    return;
  }

  const signature = req.headers[EventWebhookHeader.SIGNATURE().toLowerCase()];
  const timestamp = req.headers[EventWebhookHeader.TIMESTAMP().toLowerCase()];

  if (!signature || !timestamp) {
    console.warn('Request missing SendGrid signature or timestamp headers.');
    res.status(400).send('Bad Request: Missing signature or timestamp headers.');
    return;
  }

  // assign raw body to const
  const rawBody = req.rawBody;
  if (!rawBody) {
      console.error('CRITICAL_BODY_MISSING: req.rawBody is missing. Signature verification may fail.');
      // Depending on framework/environment, req.rawBody might not be populated automatically.
      // For some Cloud Functions environments, it is. If not, you need to read the stream.
      // Assuming req.rawBody *is* populated by the framework for now.
      // You might want to return an error if you absolutely require rawBody.
      // For this example, we proceed, but log the potential issue.
      // res.status(500).send('Internal Server Error: Request body not available for signature verification.'); return;
  }


  try {
    // 2. Pass the ECDSA PublicKey object to verifySignature
    const ew = eventWebhook.verifySignature(ecdsaPublicKeyObject, rawBody, signature, timestamp);
    console.log(ew);
    if (!ew) {
      console.warn('SendGrid webhook signature verification failed (verifySignature returned false).');
      res.status(403).send('Forbidden: Signature verification failed.');
      return;
    }
    console.log('SendGrid webhook signature verified successfully.');
  } catch (verificationError) {
    console.error('ERROR_VERIFY_SIG: Error during SendGrid webhook signature verification:', verificationError);
    res.status(500).send('Internal Server Error during signature verification. Please check server logs.');
    return;
  }
  // --- End SendGrid Webhook Signature Verification ---

  try {
    const events = req.body; // SendGrid sends an array of event objects

    if (!Array.isArray(events)) {
        res.status(400).send('Bad Request: Expected an array of events.');
        return;
    }

    console.log(`Received events: ${JSON.stringify(events)}`);

    const results = await processEvents(events);

    console.log(`Processed events. Results: ${JSON.stringify(results)}`);
    res.status(200).send('Events processed successfully.'); // Always return 200 to SendGrid, handle errors internally.

  } catch (error) {
    console.error(`Error processing SendGrid events post-verification: ${error.message}`, {
        error: error,
        requestBody: JSON.stringify(req.body) // Log the body that caused error
    });
    console.error("Stack Trace:", error.stack);
    // Still send 200 to SendGrid to prevent retries for events that are acknowledged but failed processing internally.
    res.status(200).send('Internal Server Error after event verification. Event logged.');
  }
});



async function processEvents(events) {
  const results = [];
  const batch = firestore.batch();
  // Keep track of the indexes in the 'results' array that correspond to events added to the batch
  const batchedResultIndexes = [];

  if (!Array.isArray(events) || events.length === 0) {
    console.log("No events to process or events is not an array.");
    return results; // Return empty results if no events or invalid format
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    let docId = ''; // Initialize docId, will be set if event is processed

    // Basic validation and data sanitization
    if (!event || typeof event !== 'object' || !event.email || !event.event || !event.timestamp) {
      console.warn("Skipping event due to missing required fields or invalid event structure:", event);
      results.push({
        email: event?.email || 'unknown',
        event: event?.event || 'unknown',
        sg_event_id: event?.sg_event_id || null,
        status: 'skipped_validation',
        reason: 'Missing required fields (email, event, or timestamp) or invalid event structure',
        docId: ''
      });
      continue; // Skip to the next event
    }

    try {
      // Create a unique document ID
      docId = `${event.email}-${event.event}-${event.timestamp}-${event.sg_event_id || Math.random().toString(36).substring(2, 15)}`;
      const docRef = firestore.collection('sendgrid-webhook-events').doc(docId);

      const eventData = {
        email: event.email,
        event: event.event,
        timestamp: new Date(event.timestamp * 1000), // Convert SendGrid timestamp to Firestore Timestamp
        sg_event_id: event.sg_event_id || null,
        sg_message_id: event.sg_message_id || null,
        reason: event.reason || null, // This is SendGrid's reason for the event (e.g., bounce reason)
        type: event.type || null,
        url: event.url || null,
        useragent: event.useragent || null,
        ip: event.ip || null,
        status: event.status || null, // This is SendGrid's own 'status' field for some events
        asm_group_id: event.asm_group_id || null,
        processed_at: new Date(), // Timestamp of when this function processed the event
        additional_data: {}, // Placeholder for any other top-level keys SendGrid might add
        categories: Array.isArray(event.category) ? event.category : (event.category ? [event.category] : []), // Store categories as an array
        marketing_campaign_id: event.marketing_campaign_id || null,
        marketing_campaign_name: event.marketing_campaign_name || null,
        newsletter_id: event.newsletter_id || null,
        newsletter_name: event.newsletter_name || null,
        send_at: event.send_at ? new Date(event.send_at * 1000) : null, // Convert SendGrid timestamp to Firestore Timestamp
        template_id: event.template_id || null,
        attempt: event.attempt || null,
        response: event.response || null, // For delivered events
        duration: event.duration || null, // For delivered events
        tls: event.tls || null, // For delivered events
        cert_err: event.cert_err || null, // For delivered events
        ...Object.keys(event)
          .filter(key => !['email', 'event', 'timestamp', 'sg_event_id', 'sg_message_id', 'reason', 'type', 'url', 'useragent', 'ip', 'status', 'asm_group_id', 'processed_at', 'category', 'marketing_campaign_id', 'marketing_campaign_name', 'newsletter_id', 'newsletter_name', 'send_at', 'template_id', 'attempt', 'response', 'duration', 'tls', 'cert_err'].includes(key))
          .reduce((obj, key) => {
            // Sanitize or handle non-standard data types if necessary
            if (typeof event[key] === 'object' && event[key] !== null) {
                try {
                    obj.additional_data[key] = JSON.parse(JSON.stringify(event[key])); // Deep copy and sanitize
                } catch (jsonError) {
                    console.warn(`Could not JSON stringify additional_data key "${key}": ${jsonError.message}`, event[key]);
                    // Store as string representation if possible, or skip
                    try {
                         obj.additional_data[key] = String(event[key]);
                    } catch (stringError) {
                         obj.additional_data[key] = '[Unserializable Data]';
                    }
                }
            } else if (event[key] !== undefined) { // Include nulls, exclude undefined
                 obj.additional_data[key] = event[key];
            }
            return obj;
          }, { additional_data: {} }), // Start with the additional_data structure
      };

      batch.set(docRef, eventData, { merge: true });
      // Add to results with a temporary status, and store its index for later update
      results.push({
        docId: docId,
        email: event.email,
        event: event.event,
        sg_event_id: event.sg_event_id,
        status: 'batched_for_commit', // Temporary status, will be updated after commit attempt
        reason: ''
      });
      batchedResultIndexes.push(results.length - 1); // Store the index of this result

    } catch (e) {
      console.error(`Failed to prepare event for batch: ${e.message}`, { event, docIdIfGenerated: docId, error: e });
      results.push({
        docId: docId, // docId might have been generated before the error
        email: event.email,
        event: event.event,
        sg_event_id: event.sg_event_id,
        status: 'failed_to_prepare_for_batch',
        reason: e.message
      });
    }
  }

  // Attempt to commit the batch only if there are events successfully added to it
  if (batchedResultIndexes.length > 0) {
    try {
      await batch.commit();
      console.log(`Successfully committed batch of ${batchedResultIndexes.length} events to Firestore.`);
      // Update status for successfully committed events
      for (const index of batchedResultIndexes) {
        if (results[index] && results[index].status === 'batched_for_commit') {
          results[index].status = 'committed_to_firestore';
        }
      }
    } catch (batchError) {
      console.error(`FATAL: Error committing batch to Firestore. ${batchedResultIndexes.length} events were not saved. Error: ${batchError.message}`, {
         details: batchError,
         // Consider logging batchError.code or other specific fields if known for Firestore errors
      });
      // Update status for events that were in the failed batch
      for (const index of batchedResultIndexes) {
         if (results[index] && results[index].status === 'batched_for_commit') {
            results[index].status = 'firestore_commit_failed';
            results[index].reason = batchError.message || 'Unknown Firestore commit error';
         }
      }
      // The error is logged, and results are updated.
      // We do not re-throw here, allowing helloHttp to return 200 to SendGrid
      // with detailed failure information in the logs and results.
    }
  } else if (events.length > 0) {
    console.log("No events were valid or successfully prepared for batching to Firestore.");
  } else {
    // This case is handled by the initial check, but kept for logical completeness
    console.log("No events were received to process.");
  }

  return results;
}