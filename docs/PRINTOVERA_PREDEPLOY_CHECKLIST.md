# Printovera Wedding Album Studio — pre-deployment checklist

This checklist applies to the `wedding-album-v1` branch. Do not deploy it to production until the checks below pass.

## S3 direct-upload setup

The application uses presigned PUT URLs when `STORAGE_DRIVER=s3`. Configure the following variables in the Kuberns backend environment (never commit real credentials):

- `STORAGE_DRIVER=s3`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_REGION` — use the bucket's actual AWS region
- `S3_ENDPOINT` — leave blank for AWS S3; set only for an S3-compatible provider
- `STORAGE_PUBLIC_URL` — the existing public file-serving base, normally `/api/files`

The environment example uses Sydney (`ap-southeast-2`) only as a sample. It must match the real bucket's region.

### Configure S3 bucket CORS

Presigned browser uploads require the bucket CORS policy to allow the deployed web origin. Replace the example origin with the exact production origin. If using a separate staging domain, add that origin explicitly.

```json
[
  {
    "AllowedHeaders": ["Content-Type", "Authorization", "x-amz-*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["https://YOUR-PRINTOVERA-WEB-ORIGIN"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Keep the bucket private unless public access is an intentional, reviewed requirement. Use the app's file-serving route or a separately reviewed signed-read strategy for stored photos. Never expose the S3 secret key in frontend environment variables.

## Required verification

### Photo upload and sequencing
- Upload a JPEG, PNG, WebP and (if required by your workflow) HEIC/HEIF file.
- Confirm small files, including files below 1 MB, work; the current application maximum is 20 MB per image.
- Confirm the browser sends a PUT to the presigned S3 URL and the backend finalizes the same key.
- Confirm a rejected/failed upload does not add a photo to the album.
- Reorder photos within Couple, Ritual, Dance, Ceremony, Guest and Family; reload and confirm order persists.
- Test drag sequencing and the preview-size slider on desktop, tablet and touch devices.
- Confirm the non-wedding ClickBook upload flow still works.

### Mock/reference files for category designs
- In Admin → Album Designs, upload a mock/reference image for each category design.
- Confirm the mock is shown in the admin design card and the URL persists after refresh.
- Generate a test album and confirm each page retains the correct category design metadata and reference URL.
- Verify PDF/JPEG print output does not render the mock/reference image on top of customer photographs unless that behaviour is explicitly intended.

### WhatsApp OTP
- Configure `WHATSAPP_PROVIDER=aoc`, API URL, API key, sender number, approved template and campaign in the hosting dashboard.
- Test send and verify on a real test number. Mock mode is only for development; never accept a fixed demo OTP in production.
- Confirm failed provider responses fail closed and do not expose an OTP.

### Payments
- Confirm Razorpay live key ID, secret and webhook secret are configured only in the hosting dashboard.
- Test order creation, checkout, signature verification, webhook idempotency, failed/cancelled payment and paid-order locking in Razorpay test mode first.
- The checkout screen now offers a WhatsApp share action for the hosted Razorpay checkout URL. WhatsApp is the messaging channel, not the payment processor. Automated outbound payment reminders require a separate approved provider template; do not reuse the OTP template as a payment template.

### Build and data safety
- Run frontend lint/type checks and backend tests/build in CI.
- Test PDF generation, ZIP download, S3 retrieval, thumbnail/preview display and restart persistence.
- Confirm no production branch merge or deployment occurred as part of this work.
- Keep the production branch untouched until all checks pass and a reviewed pull request is approved.
