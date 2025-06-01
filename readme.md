# SendGrid Event Webhook Handler for Google Cloud Functions

## 🚀 Overview

This Google Cloud Function is designed to securely receive and process event webhooks from SendGrid. It verifies the authenticity of incoming requests using SendGrid's signed event webhook mechanism and then stores the processed event data into a Google Firestore collection.

---

## ✨ Features

* **Signature Verification**: Cryptographically verifies that incoming webhook requests originate from SendGrid using an ECDSA P-256 public key.
* **User-Agent Validation**: Checks the `User-Agent` header for an expected SendGrid value as an additional, albeit softer, verification step.
* **Batch Firestore Writes**: Processes an array of events from SendGrid and writes them to Firestore in a single batch for efficiency.
* **Detailed Event Storage**: Stores key information from SendGrid events, including email, event type, timestamp, and other relevant metadata.
* **Granular Error Handling**: Provides specific error messages and logs for issues during key conversion, signature verification, and Firestore batch commits.
* **Configurable**: Uses environment variables for Google Cloud Project ID and the SendGrid Public Verification Key.

---

## 📋 Prerequisites

Before deploying this function, ensure you have the following:

* **Node.js** (version 20 or as specified in `package.json`'s `engines` field).
* **Google Cloud SDK (`gcloud`)** installed and configured.
* A **Google Cloud Platform (GCP) Project** with billing enabled.
* The **Cloud Functions API** and **Cloud Build API** enabled in your GCP project.
* A **SendGrid Account** with Event Webhooks configured and Signed Event Webhook feature enabled.
* The **Verification Key (Public Key)** provided by SendGrid for your signed webhook.

---

## 🛠️ Setup & Configuration

### 1. Get the Code
Clone or download the function code into your local development environment.

### 2. Install Dependencies
Navigate to the function's root directory and install the necessary Node.js packages:
```bash
npm install
This will install dependencies listed in package.json, such as:

@google-cloud/functions-framework
@google-cloud/firestore
@sendgrid/eventwebhook
3. Environment Variables
This function requires the following environment variables to be set in your Google Cloud Function's runtime environment:

GCP_PROJECT (Optional): Your Google Cloud Project ID. If not set, the function attempts to infer it or uses the hardcoded fallback "interview-412415" (it's recommended to always set this explicitly for clarity and portability).
SENDGRID_PUBLIC_KEY (Required): The full PEM-formatted public key provided by SendGrid for verifying signed event webhooks. It should look like this:
Code snippet

-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA0gT54t7O...
...
-----END PUBLIC KEY-----
Important: Ensure the entire string, including the -----BEGIN...----- and -----END...----- markers and any newline characters (\n) within the key, is correctly set as the environment variable's value.

### 3. Google Cloud Deployment

---# env.yaml
GCP_PROJECT: your-gcp-project-id # Replace with your actual GCP Project ID
SENDGRID_PUBLIC_KEY: |
  -----BEGIN PUBLIC KEY-----
  YOUR_SENDGRID_PUBLIC_KEY_HERE
  -----END PUBLIC KEY-----
```
**Replace `your-gcp-project-id` and `YOUR_SENDGRID_PUBLIC_KEY_HERE` with your actual values.**

**Explanation of the `env.yaml` format:**
*   This YAML file defines the environment variables that will be passed to your Cloud Function during deployment.
*   The `|` symbol followed by indented lines is standard YAML syntax for multi-line strings. This is crucial for the `SENDGRID_PUBLIC_KEY` as the key itself contains newline characters.

**Deployment Command:**

Use the `gcloud` command with the `--env-vars-file` flag pointing to your `env.yaml`:

```bash
gcloud functions deploy sendgrid-webhook \
  --runtime nodejs20 \
  --trigger-http \
  --entry-point helloHttp \
  --region us-central1 \
  --env-vars-file env.yaml \
  --allow-unauthenticated \
  --gen2
```

**Explanation of the deployment command:**

*   `gcloud functions deploy sendgrid-webhook`: This is the command to deploy a Cloud Function named `sendgrid-webhook`.
*   `--runtime nodejs20`: Specifies that the function should run on the Node.js 20 runtime.
*   `--trigger-http`: Configures the function to be triggered by HTTP requests.
*   `--entry-point helloHttp`: Tells Cloud Functions the name of the function (exported in `index.js`) that handles the incoming requests.
*   `--region us-central1`: Specifies the Google Cloud region where the function will be deployed. You can choose a region closer to your users or SendGrid servers.
*   `--env-vars-file env.yaml`: This crucial flag tells `gcloud` to load environment variables from the `env.yaml` file you created.
*   `--allow-unauthenticated`: Makes the function publicly accessible via HTTP. **For production, it is highly recommended to secure your function.** This option is used here for simplicity during initial setup. Consider using IAM or other authentication methods in a production environment.
*   `--gen2`: Deploys the function using the Cloud Functions (2nd gen) platform, which offers enhanced features and integration with Eventarc.

**Alternative: Setting Environment Variables Directly (Less Recommended for Keys)**

You can also set environment variables directly on the command line using the `--set-env-vars` flag. However, for the `SENDGRID_PUBLIC_KEY`, which contains special characters and is multiline, using `env.yaml` is much cleaner and less prone to errors.
