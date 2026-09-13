from flask import Flask, render_template, url_for, jsonify, request
import datetime
import requests
import math
import uuid

SESSION_ID = str(uuid.uuid4())

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("home.html")
@app.route("/allocation")
def allocation():
    return render_template("allocation.html")
@app.route("/simulation")
def simulation():
    return render_template("simulation.html")

tagging = {
    # "name" : [id-0, temp-1, humidity-2, fungus-3, calories-4, carbohydrates-5, dietary fiber-6, sugar-7, protein-8, fat-9, VitC-10, kc-11, VitE-12, ke-13, VitB9-14, kb-15, VitA-16, ka-17, VitCD-18, VitED-19, VitB9D-20, VitAD-21],
    "banana-poovam" : [1, 14, 87.5 , 0, 106, 23.4, 2.3, 12.5, 1.5, 0.3, 10.3, 0.045, 0.1, 0.018, 20, 0.025, 74, 0.015, 0, 0, 0, 0],
    "banana-robusta" : [2, 13.5, 87.5, 0, 105, 24, 2, 12.2, 1.2, 0.3, 10.3, 0.045, 0.1, 0.018, 20, 0.025, 74, 0.015, 0, 0, 0, 0],
    "Guava-white" : [3, 9, 92.5, 0, 68, 14.3, 5.4, 8.9, 2.6, 1, 228.3, 0.038, 0.73, 0.015, 49, 0.02, 31, 0.012, 0, 0, 0, 0],
    "Guava-red" : [4, 11, 92.5, 0, 66, 14, 5.2, 8.5, 2.5, 0.9, 228.3, 0.038, 0.73, 0.015, 49, 0.02, 31, 0.012, 0, 0, 0, 0],
    "Orange" : [5, 6, 87.5, 0, 47, 11.8, 2.4, 9.4, 0.9, 0.1, 53.2, 0.022, 0.18, 0.012, 30, 0.018, 11, 0.01, 0, 0, 0, 0],
    "pineapple" : [6, 11, 87.5, 0, 43, 9.4, 3.5, 9.9, 0.5, 0.2, 47.8, 0.032, 0.02, 0.016, 18, 0.022, 3, 0.014, 0, 0, 0, 0],
    "pear" : [7, 11, 87.5, 0, 57, 15.2, 3.1, 9.8, 0.4, 0.1, 4.3, 0.028, 0.12, 0.01, 6, 0.015, 1, 0.008, 0, 0, 0, 0],
    "beans-broad" : [8, 0.5, 92.5, 0, 31, 5.4, 2, 1.8, 1.9, 0.2, 12.2, 0.065, 0.41, 0.025, 33, 0.04, 35, 0.02, 0, 0, 0, 0],
    "beans-lean" : [9, 6.5, 92.5, 0, 33, 5.7, 2.2, 1.9, 2.1, 0.2, 12.2, 0.065, 0.41, 0.025, 33, 0.04, 35, 0.02, 0, 0, 0, 0],
    "french-beans-country" : [10, 8.5, 92.5, 0, 24, 4.7, 2.4, 1.6, 1.7, 0.1, 12.2, 0.065, 0.41, 0.025, 33, 0.04, 35, 0.02, 0, 0, 0, 0],
    "french-beans-hybrid" : [11, 1, 92.5, 0, 21, 4.2, 1.9, 1.4, 1.5, 0.1, 12.2, 0.065, 0.41, 0.025, 33, 0.04, 35, 0.02, 0, 0, 0, 0],
    "cabbage" : [12, 6, 92.5, 0, 25, 5.8, 2.5, 3.2, 1.3, 0.1, 36.6, 0.025, 0.15, 0.012, 43, 0.018, 5, 0.01, 0, 0, 0, 0],
    "muskmelon" : [13, 3.5, 92.5, 0, 34, 8.2, 0.9, 7.9, 0.8, 0.2, 36.7, 0.048, 0.05, 0.02, 21, 0.03, 169, 0.018, 0, 0, 0, 0],
    "megha-tomato-3" : [14, 11, 87.5, 0, 19, 4, 1.1, 2.7, 0.9, 0.2, 13.7, 0.035, 0.54, 0.016, 15, 0.022, 42, 0.014, 0, 0, 0, 0],
    "ripe-tomato" : [15, 11.5, 87.5, 0, 20, 4.2, 1.3, 2.8, 1, 0.2, 13.7, 0.035, 0.54, 0.016, 15, 0.022, 42, 0.014, 0, 0, 0, 0],
    "potato-brown-big" : [16, 8.5, 92.5, 0, 79, 18, 2, 0.8, 2.1, 0.1, 19.7, 0.012, 0.01, 0.005, 16, 0.008, 0.1, 0.004, 0, 0, 0, 0],
    "potato-brown-small" : [17, 5.5, 92.5, 0, 75, 16.8, 2.2, 1, 1.9, 0.1, 19.7, 0.012, 0.01, 0.005, 16, 0.008, 0.1, 0.004, 0, 0, 0, 0],
    "potato-red" : [18, 8.5, 92.5, 0, 70, 15.9, 2.4, 1.2, 1.9, 0.1, 19.7, 0.012, 0.01, 0.005, 16, 0.008, 0.1, 0.004, 0, 0, 0, 0],
    "onion-big" : [19, 1, 67.5, 0, 39, 9, 1.6, 4.4, 1.1, 0.1, 7.4, 0.01, 0.02, 0.004, 19, 0.006, 0.1, 0.003, 0, 0, 0, 0],
    "onion-small" : [20, 1, 67.5, 0, 60, 13.5, 2.5, 5, 1.8, 0.1, 7.4, 0.01, 0.02, 0.004, 19, 0.006, 0.1, 0.003, 0, 0, 0, 0],
    "ginger" : [21, 13, 87.5, 0, 80, 17.8, 2, 1.7, 1.8, 0.8, 5, 0.008, 0, 0.003, 11, 0.005, 0, 0.002, 0, 0, 0, 0],
    "turmeric" : [22, 13, 87.5, 0, 354, 65, 21, 3.2, 8, 10, 25.9, 0.007, 39, 0.005, 3.1, 0.004, 0, 0, 0, 0, 0, 0], 
    "pepper" : [23, 8.5, 92.5, 0, 251, 64, 25.3, 0.6, 10.4, 3.3, 127.7, 0.03, 1.58, 0.015, 10, 0.02, 157, 0.012, 0, 0, 0, 0],
    "garlic-small" : [24, 1, 67.5, 0, 152, 33.5, 2.2, 1.1, 6.6, 0.5, 31.2, 0.006, 0.01, 0.003, 3, 0.004, 0, 0.002, 0, 0, 0, 0],
    "garlic-big" : [25, 1, 67.5, 0, 145, 32.5, 2, 1, 6.2, 0.4, 31.2, 0.006, 0.01, 0.003, 3, 0.004, 0, 0.002, 0, 0, 0, 0]
}

allocate = [
    [0,0,0],
    [2,0,0],
    [4,0,0],
    [1,1,0],
    [3,1,0],
    [0,2,0],
    [2,2,0],
    [4,2,0],
    [1,0,1],
    [3,0,1],
    [0,1,1],
    [2,1,1],
    [4,1,1],
    [1,2,1],
    [3,2,1],
    [0,0,2],
    [2,0,2],
    [4,0,2],
    [1,1,2],
    [3,1,2],
    [0,2,2],
    [2,2,2],
    [4,2,2],
    [1,0,3],
    [3,0,3],
    [0,1,3],
    [2,1,3],
    [4,1,3],
    [1,2,3],
    [3,2,3],
    [1,0,0],
    [3,0,0],
    [0,1,0],
    [2,1,0],
    [4,1,0],
    [1,2,0],
    [3,2,0],
    [0,0,1],
    [2,0,1],
    [4,0,1],
    [1,1,1],
    [3,1,1],
    [0,2,1],
    [2,2,1],
    [4,2,1],
    [1,0,2],
    [3,0,2],
    [0,1,2],
    [2,1,2],
    [4,1,2],
    [1,2,2],
    [3,2,2],
    [0,0,3],
    [2,0,3],
    [4,0,3],
    [1,1,3],
    [3,1,3],
    [0,2,3],
    [2,2,3],
    [4,2,3]
]

def allocation(n):
    return allocate[:n]

def decay(a, k, t):
    # c = (2.67)**(-k*t)
    return a * math.exp(-k*t)

def time_expiry(k):
    return math.log(2)/k

weight = 0.0
time1 = 0.0

@app.route('/session_id')
def session_id():
    return jsonify({"session_id": SESSION_ID})

@app.route('/send_time', methods=['POST'])
def receive_time():
    global weight, time1
    data = request.get_json()
    raw_time = data.get("Data")
    raw_weight = data.get("w")
    time1 = float(raw_time) if raw_time is not None else 0.0
    weight = float(raw_weight) if raw_weight is not None else 0.0
    print(weight)
    return jsonify({"status": "success"})

@app.route('/sendCrate')
def sendCrate():
    crates_needed = int(weight//20)
    occupie = allocation(crates_needed)
    del allocate[:crates_needed]
    return jsonify({"occupied_boxes" : occupie, "session_id" : SESSION_ID})

def decayAllocation(a, t):
    tagging[a][18] = decay(tagging[a][10], tagging[a][11], t)
    tagging[a][19] = decay(tagging[a][12], tagging[a][13], t)
    tagging[a][20] = decay(tagging[a][14], tagging[a][15], t)
    tagging[a][21] = decay(tagging[a][16], tagging[a][17], t)



# @app.route("/ImageData")
# def ImageData():
#     response = requests.get("https://api.unsplash.com/search/photos?page=1&query=mango&client_id=UIHRSjdetB2J6siGT9E0Ux7pjrlO8uBh4X78TFIpQxU")
#     data = response.json()
#     url = data["results"][0]["urls"]["small"]
#     return jsonify({"url": url})



@app.route("/NutrientsData/<a>")
def NeuData(a):
    decayAllocation(a, time1)
    expiryC = time_expiry(tagging[a][11])
    expiryE = time_expiry(tagging[a][13])
    expiryB = time_expiry(tagging[a][15])
    expiryA = time_expiry(tagging[a][17])
    expiry = min(expiryA, expiryB, expiryC, expiryE)
    name = a
    temp = tagging[a][1]
    humidity = tagging[a][2]
    fungus = tagging[a][3]
    calories = tagging[a][4]
    carbohydrates = tagging[a][5]
    diet = tagging[a][6]
    sugar = tagging[a][7]
    protein = tagging[a][8]
    fat = tagging[a][9]
    VitC = tagging[a][18]
    VitE = tagging[a][19]
    VitB = tagging[a][20]
    VitA = tagging[a][21]
    days = expiry - time1
    return jsonify({"name" : name, "temp" : temp, "humidity" : humidity, "fungus" : fungus, "calories" : calories, "carbohydrates" : carbohydrates, "diet" : diet, "sugar" : sugar, "protein": protein, "fat" : fat, "VitC": VitC, "VitE" : VitE, "VitB" : VitB, "VitA" : VitA, "days" : days})


if(__name__ == "__main__"):
    app.run(debug = True)