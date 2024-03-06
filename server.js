// Parse the URL to get the category parameter value
// require is ideal but have to work with old node versions, modern imports can be seen below.
import { createTransport } from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import multer from 'multer';
import mysql from 'mysql';
import { PDFDocument, rgb} from 'pdf-lib';
import { promises } from "fs";
const { readFile, writeFile,unlink } = promises;
import fontkit from '@pdf-lib/fontkit';
import puppeteer from 'puppeteer';

// Start app
const app = express();
const port = 3000;
app.use(express.json())
app.use(cors());
app.use(express.static("public"));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.JSON());
function formatDate() {
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const formattedDate = new Date().toLocaleDateString(undefined, options);
  return formattedDate;
}


// INIT req
app.get('/',(req,res)=>{
  console.log("server working")
  res.send("Server active")

},)
// AUTOMATED MAIL REQ
app.post('/sendMail',upload.single("pdf"), async (req, res) => {
      
      // DB con
      const connection = mysql.createConnection({
        host: process.env.host,
        user: process.env.user,
        password: process.env.pwd,
        database: process.env.db
      });
      
      //////////////     UNIQUE ID GENERATOR
      const uniqueId = uuidv4();
      console.log("posting with data: ",req.body)
      const {name,mail,gender,countryCode,mobileno,academicQualification,currentYearCourse,currentYearStudy, skilllevel,survey,internship}=req.body;
      const pdf = req.file.buffer;
      console.log("FORMDATA- ","uniqueId: ",uniqueId,req.body,"pdf: ",pdf);

      if(!mail){
        return res.status(400).json({"error":"Please enter a valid email"});
      }
      //pdf stuff
      //////////////////////// pdf - html
      const pdfPath='./pdftosend/'+uniqueId+'.pdf';
      try {
        const formattedDate = formatDate();
        console.log(formattedDate);
        // Read the HTML file content
        const htmlFilePath = './offerletter/'+internship+'.html';
        const htmlContent = await readFile(htmlFilePath, 'utf-8');
        // Modify the HTML content as needed
        const modifiedContent = htmlContent.replace('tempname', `${name}`);
        const modifiedHtmlContent = modifiedContent.replace('28 September 2023', formattedDate);
        // Launch headless Chrome browser
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
    
        // Set content to the modified HTML
        await page.setContent(modifiedHtmlContent);
    
        // Generate PDF from the modified HTML
        const pdfBuffer = await page.pdf({
          format: 'A4', // You can adjust the format and other options as needed
        });
    
        // Close the browser
        await browser.close();
        // const pdfFiPath = './pdftosend/'+uniqueId+'.pdf';
        await writeFile(pdfPath, pdfBuffer,(err, data) => {
          if (err) {
            console.log(err);
            return res.status(503).json({msg:'File generation error'});
          }
        });

        // Send the generated PDF as a response

        // res.status(200).send("ok");
      } catch (error) {
        console.error('Error in pdf making:', error);
        return res.status(503).json({msg:'Error processing request'});
      }

      /////////////////////
      // Insert form values into the database
      // UPDATE `registration` SET `uniqueid`='jvj3546',`name`='nr',`email`='nr@gmail.com',`gender`='male',`countryCode`='+91',`mobileno`='9597121918',`academicQualification`='UG',`currentYearCourse`='B.Tech',`currentYearStudy`='3',`skilllevel`='9',`survey`='Socials',`registeredTime`='',`pdf`='' WHERE 1
      // ........
        connection.connect((err) => {
          if (err) {
            console.error('Error connecting to MySQL database: ' + err.stack);
            return res.status(501).send('Error connecting to the database');
            
          }
      
          console.log('Connected to MySQL database as id ' + connection.threadId);
          const qCheckEmail = 'SELECT COUNT(email) AS count FROM '+internship+ ' WHERE email = ?';    //  first create db -- change to each db
          const q='INSERT INTO '+internship+' (uniqueid,name, email,gender,countryCode,mobileno,academicQualification,currentYearCourse,currentYearStudy, skilllevel,survey, pdf) VALUES (?, ?, ?,?,?,?,?,?,?,?,?,?)';
          // quering into db

          connection.query(qCheckEmail, [mail], (error, results) => {
            if (error) {
              console.error('Error checking email:', error.stack);
              return res.status(501).json({msg:'Error checking email in the database'});
              
            }
          
            const emailExists = results[0].count > 0;
          
            if (emailExists) {
              // Email already exists, handle accordingly
              console.log("Email already exist");
              return res.status(401).json({msg:"Email already exists in the database"});
              
            } 
            else{     
               // NO PREVIOS ENTRY     
                connection.query(q,[uniqueId,name,mail,gender,countryCode,mobileno,academicQualification,currentYearCourse,currentYearStudy, skilllevel,survey, pdf],(error, results, fields) => {
                // Don't forget to handle errors
                if (error) {
                  console.error('Error executing SELECT query: ' + error.stack);
                  return res.status(500).json({msg:'Error fetching data from the database'});
                  
                }
              
                console.log('Query results:', results);
                res.status(200).json({msg:"Successfully registered"});
                connection.end();
                // after added 2 mail send mail -NODEMAILER
                if(results)
                {
                  console.log("Data added to db")
                  const transporter = createTransport({
                    service: 'Gmail',
                    auth: {
                      user: process.env.g_user,    // Your email address
                      pass: process.env.g_pass,     // Your email password or app-specific password
                    },
                  });
                  if(transporter && pdfPath){
                    const email_content=`
                    Dear ${name},

                    We are thrilled to inform you that you have been selected for the CodeAlpha Internship Program. Congratulations on your achievement!
                    Program Details:
                    Internship: ${internship} 
                    Duration: 1 Month
                    Location: Remote
                    On behalf of the entire CodeAlpha team, I extend our warmest congratulations. 
                    Please see through the attached offer letter
                    Best regards,
                    Swati Sri
                    CEO
                    CodeAlpha
                    `
                    console.log("transporter is ready.. login succcess.")
                    // Email configuration
                    const mailOptions = {
                      from: process.env.g_user,      // Sender's email address
                      to: mail,       // Recipient's email address
                      subject: 'Internship offered by CodeAlpha',
                      text: email_content,
                      attachments: [
                        {
                          filename: uniqueId+'.pdf', // Change to the actual PDF file name
                          path: pdfPath, // Change to the actual file path
                        },
                      ]
                    };
                    
                    // Send the email
                    transporter.sendMail(mailOptions, (error, info) => {
                      if (error) {
                        console.error('Error sending email:', error);
                        unlink(pdfPath);
                      } else {
                        console.log('Email sent:', info.response);
                        unlink(pdfPath);
                       // return res.status(201).json({msg:"Mail is sent"});
                        }
                      });
                    }
                }   
              });
            }
            });
      });
});

app.listen(port, () => {
    console.log(`Server is up on ${port}`);
});
/* 
ideal imports in node.js
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const multer = require('multer');
const mysql = require('mysql');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const fontkit = require('@pdf-lib/fontkit');
const puppeteer = require('puppeteer');
*/