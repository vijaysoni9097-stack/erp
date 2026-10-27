# Customer credit and partial payments

## Using the counter

1. Add medicines and select **Pay in full**, **Partially paid**, or **Full credit · pay later** under Payment.
2. For partial payment, enter the amount actually received, choose its method, provide a digital transaction reference if needed, and confirm receipt. Full credit does not ask you to confirm receipt of money.
3. A valid customer mobile is mandatory whenever the invoice will remain unpaid. Final submission opens an acknowledgment dialog showing the new credit amount.
4. Entering the mobile on a later bill displays previous credit, current unpaid amount, and combined amount due. Shared mobiles may cover several named family members; select the correct invoice when collecting a repayment.
5. **Total Credit** on Dashboard and Dispensing opens the list of outstanding invoices and customer names/mobiles. Open an invoice to see medicines, initial payment, later payments, and remaining balance. Record a partial or final repayment there, or print/save its invoice as PDF.

Existing invoices are not retroactively marked unpaid. “Credit” here means an amount owed by a customer, not a tax/refund credit note. New credit invoices remain completed sales and deduct stock once. Dashboard sales include the complete invoice value; cash/card/UPI collections include only money received, including repayments received today for older invoices. Printed invoices show paid-to-date and outstanding amounts.

If a checkout or collection times out, keep its page/dialog open and use **Retry / confirm**. The request UUID is preserved so the server does not record the same payment or dispense stock twice. The credit list is paginated; totals cover all matching invoices, not just the visible page.

## Database and deployment

The change adds `sale_credits`, `credit_collections`, and `credit_notifications` in the configured PostgreSQL schema. Startup's existing `Base.metadata.create_all()` creates these tables on both local API and Render; no destructive migration or existing-row conversion is required. Deploy the backend before the frontend. Both services continue using this ERP repository's `backend/` and `frontend/` folders and the existing database.

Checkout commits the invoice, stock movement, initial payment, credit and notification outbox together. Repayments have unique request IDs, actor IDs, payload hashes, exact decimal amounts, references and timestamps. They lock the credit/inventory transaction to prevent over-collection and maintain immutable initial payments plus separate repayment history. Read APIs use existing authenticated access; only pharmacists, admins and superadmins can grant credit or record repayments.

## WhatsApp setup (not configured yet)

Use Meta WhatsApp Business Cloud API with an approved template. Configure these privately in `backend/.env` for local use and the Render API environment for hosted use:

```
WHATSAPP_ACCESS_TOKEN=<server-side access token>
WHATSAPP_PHONE_NUMBER_ID=<sender phone-number ID>
WHATSAPP_TEMPLATE_NAME=<approved template name>
WHATSAPP_TEMPLATE_LANGUAGE=en
WHATSAPP_API_VERSION=<supported Graph API version, e.g. vNN.N>
```

Choose a version supported by your Meta application. The template must have exactly four positional **body** text parameters, in this order:

1. Customer name
2. Invoice number
3. New credit amount
4. Total outstanding for the mobile at the time credit was granted

For an INR pharmacy an example template body is:

> Hello {{1}}, invoice {{2}} has an unpaid amount of INR {{3}}. Your total outstanding balance is INR {{4}}. Please contact the pharmacy if you need help.

Use the appropriate currency text for your pharmacy's currency when approving the template. No medicine or prescriber details are sent. Customer consent is captured by the checkout checkbox. Without consent the status is `no_consent`; without provider configuration it is `not_configured`, and the UI says no message was sent.

A durable worker sends eligible messages automatically after configuration, outside checkout, including previously consented `not_configured` messages. It records `queued`, `sending`, `accepted`, `failed` or `unknown`. **Accepted is provider acceptance, not delivery confirmation.** Delivery/read webhooks are not implemented. HTTP errors and uncertain sends are surfaced in invoice details; uncertain sends or interrupted sends are not blindly retried, avoiding duplicate customer messages. After correcting configuration, use **Retry WhatsApp notification** in invoice details for known failures. Already accepted, ambiguous, and non-consented messages cannot be resent through this action. Investigate uncertain messages in Meta before any manual resend. Existing financial records remain saved if notification fails. No real customer messages are sent by automated tests.

Primary API reference: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

## Verification

`npm test`, `npm run test:backend`, and `npm run build` verify the frontend calculations/printing and isolated HTTP tests for required phone/acknowledgment, partial/full credit, stock deductions, duplicate requests, later repayments, overpayment prevention, role checks, shared mobiles, collection date ranges, and mocked WhatsApp acceptance/timeouts. Backend tests use a disposable SQLite database and never the hosted pharmacy database.
