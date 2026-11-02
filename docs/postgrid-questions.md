# Questions to ask PostGrid support

## Launch blockers (Canada)

1. What's included in the $2.12 (B&W) / $2.22 (colour) Canada first-class price? How many pages does it cover, and what is the charge per extra page?
2. How many sheets fit in the standard #10 envelope? What happens beyond that? Is there a flat-mailer option, and what does it cost?
3. We use `addressPlacement: insert_blank_page` for PDF-only letters. Is that blank address page billed as a printed sheet?
4. Starter plan: does "500 free mailings/month" mean no per-letter fees, or only platform fees waived? What happens at letter 501?
5. Is everything invoiced in USD for a Canadian account? Do you charge GST/HST, and do invoices support input tax credits?
6. What is the print-mail API rate limit? (We poll every 15 minutes and create letters one at a time.)
7. Are webhooks (`letter.updated`) available on Starter?

## Address and design

8. Which Canadian address-window guideline is current: two windows (return 4x0.9375 in, recipient 4x1 in) or the older single 2.5x2.5 in zone?
9. When `addressStatus` is `corrected`, is the corrected address what gets printed and mailed? Are failed or corrected addresses charged differently?
10. Is the return address required for Canadian Lettermail? Can we use one fixed return address for all anonymous sends?

## Services and tracking

11. Canada registered mail: is it requested via `mailingClass: registered` or `extraService`? (The docs conflict.) Cost, tracking and proof of delivery?
12. Is any tracking available for regular Canada Post Lettermail, or only registered/express?
13. Please confirm rates (Canada express $35, registered $25; US express $19, certified $6.94) and the exact request fields.

## Other countries (US / UK / Australia)

14. Can one account use the Canada, US, UK and Australia networks at once? Which plan is needed, and are separate sign-ups required?
15. What currency and rates apply for UK and Australia (postgrid.co.uk, postgrid.com.au)? Which `mailingClass` values do you recommend?
16. Do UK and AU letters use A4 / 8.25x11.75 in sizing, and what are their address-window zones?
17. Can you print and mail to other countries from Canada or the US (rest of world)? Cost, and is it handled via sales?

## Account go-live

18. What's needed to move from a `test_` key to live (payment method only, or any approval step)?
19. Do cancellations before the send date cost anything? Is the ready-to-printing cutoff midnight Toronto time?
