from flask import Flask, request, jsonify, render_template
import random
import smtplib
import os

app = Flask(__name__)

otp_storage = {}


sender_email = os.environ.get("SENDER_EMAIL", "a3009419@gmail.com")
app_password = os.environ.get("APP_PASSWORD", "uzbf aluj nemx onbb")

@app.route("/")
def home():
    return render_template("index.html")

def send_otp(email, otp):
    import ssl
    message = f"""Subject: NexPay OTP Verification
To: {email}
From: {sender_email}

Your OTP code is: {otp}

This OTP is valid for 5 minutes. Do not share it with anyone.
"""
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(sender_email, app_password)
            server.sendmail(sender_email, email, message)
        print("OTP sent successfully")
    except Exception as e:
        print("Error sending OTP:", e)

@app.route("/send-otp", methods=["POST"])
def sendotp():
    data = request.get_json()
    email = data.get("email")
    if not email:
        return jsonify({"message": "Email required"}), 400
    otp = random.randint(100000, 999999)
    otp_storage[email] = otp
    send_otp(email, otp)
    return jsonify({"message": "OTP sent to your email"})

@app.route("/verify-otp", methods=["POST"])
def verify():
    data = request.get_json()
    email = data.get("email")
    user_otp = data.get("otp")
    saved_otp = otp_storage.get(email)
    if saved_otp and str(saved_otp) == str(user_otp):
        otp_storage.pop(email)
        return jsonify({"message": "OTP Verified", "status": "success"})
    else:
        return jsonify({"message": "Invalid OTP", "status": "fail"})

if __name__ == "__main__":
   app.run(debug=True)