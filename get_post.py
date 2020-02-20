# -*- coding: utf-8 -*-
"""
Created on Wed Feb 19 22:00:20 2020

@author: Apurv
"""

import requests
import time
from random import randint

while True:
    val = randint(0,1)
    ip = "40.121.161.191"
    #Get
    if val == 0:
        api = "http://"+ip+":1234/sports/Federer"
        
        r = requests.get(url = api, params = "") 
          
        data = r.json() 
        print(data[0]["title"])
        
    # Post
    else:
        long_text = open("./long_text.txt", "r").read()
        img = open("/home/jay/Downloads/federer.jpg", "rb").read()
        # print(long_text)
        api = "http://"+ip+":1234/sports"
        data = {
            "title":"Federer",
            "text": long_text,
            "tags[0]":"tennis",
            "tags[1]":"federer",
            "images": img
        }
        ra = requests.put(url = api, data = data) 
        print(ra)
        
    # time in secs
    time.sleep(2)
