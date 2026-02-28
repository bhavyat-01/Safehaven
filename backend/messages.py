import smtplib
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv

load_dotenv()

# Your info
smtp_server = os.getenv("SMTP_SERVER")  # Gmail SMTP server
smtp_port = int(os.getenv("SMTP_PORT"))
email_address = os.getenv("EMAIL_ADDRESS")  # your Gmail
email_password = os.getenv("EMAIL_PASSWORD")

# Recipient SMS via carrier gateway
to_number = "7327356063"
carrier_gateway = "vtext.com"  # Verizon example
to_email = f"{to_number}@{carrier_gateway}"

# Message
msg = MIMEText("Hello! This is a test from Python email-to-SMS.")
msg["From"] = email_address
msg["To"] = to_email
msg["Subject"] = ""  # SMS usually ignores subject

# Send the email
with smtplib.SMTP(smtp_server, smtp_port) as server:
    server.starttls()
    server.login(email_address, email_password)
    server.sendmail(email_address, to_email, msg.as_string())

print("SMS sent via email!")