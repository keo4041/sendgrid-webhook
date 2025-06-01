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