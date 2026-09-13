import serial
import time

# Open the serial port
arduino = serial.Serial(port='COM7', baudrate=9600, timeout=.1)

list = []

while True:
    data = arduino.readline().decode('utf-8').strip()
    if data:
        print("Received:", data)
    time.sleep(1)

