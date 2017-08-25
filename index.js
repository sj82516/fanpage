const koa = require("koa");
var bodyParser = require('koa-bodyparser')
const axios = require("axios");
const validator = require("validator");
const cheerio = require("cheerio");
const Router = require('koa-router')
const router = new Router()

const config = require("./config")

const app = new koa();
// webhook 驗證用的token
const verify_token = config.verify_token

// 發文用的token
const access_token = config.access_token
const page_id = config.page_id

// 為了避免重複發文，紀錄comment_id
let postArr = []

app.use(bodyParser())

// facebook 驗證webhook用，不用改，只需要注意verify_token
router.get("/webhook", function (ctx, next) {
    let hub_verify_token = ctx.query["hub.verify_token"]
    let challenge = ctx.query["hub.challenge"]

    if (hub_verify_token === verify_token) {
        return ctx.body = challenge
    }
    return 
})

// facebook webhook發送通知的路徑
router.post("/webhook", async function (ctx, next) {
    var data = ctx.body;
    try {
        // 只蒐集跟Page相關的通知
        if (data.object === 'page') {

            // facebook可能積很多訊息一次來，要用Array map去輪詢
            data.entry.forEach(function (entry) {
                // 如果是訊息
                if (entry.messaging) {
                    var pageID = entry.id;
                    var timeOfEvent = entry.time;

                    entry.messaging.forEach(function (event) {
                        if (event.message) {
                            // FB官方的解法，照抄而已
                            receivedMessage(event);
                        } else {
                            console.log("Webhook received unknown event: ", event);
                        }
                    });
                } else {
                    e.changes.map(async c => {
                        // 判斷是否為留言型別
                        if (c.value && c.value.comment_id && c.value.verb === 'add' && c.value.sender_id !== page_id) {
                            // 避免重複寄送，自己用Array存
                            if (postArr.find(p => p == c.value.comment_id)) return
                            postArr.push(c.value.comment_id)

                            // 用Messenger私訊回覆
                            if (c.value.message == '私訊') return await axios.post("https://graph.facebook.com/v2.10/" + c.value.comment_id + "/private_replies?access_token=" + access_token, {
                                message: "以私"
                            })

                            // 日期判斷
                            let date = validator.toDate('' + c.value.message)
                            if (date == null) return await axios.post("https://graph.facebook.com/v2.10/" + c.value.comment_id + "/comments?access_token=" + access_token, {
                                message: "哈哈 UCCU，連日期都不會打的笨蛋是不被科學家接受的"
                            })
                            const histroyToday = "http://history.pansci.asia/search/" + (date.getMonth() + 1) + "%2F" + date.getDate()

                            // 爬蟲有成功找到訊息，回覆留言
                            let response = await crawler(histroyToday)
                            if (response != null && response != undefined) return await axios.post("https://graph.facebook.com/v2.10/" + c.value.comment_id + "/comments?access_token=" + access_token, {
                                message: "這一天科學史上的大事:  \u000A" + response + "  \u000A ,更多詳情請看 " + histroyToday
                            })

                            return await axios.post("https://graph.facebook.com/v2.10/" + c.value.comment_id + "/comments?access_token=" + access_token, {
                                message: "科學家都在打盹，沒什麼大事，等你搞出大事告訴小編啊啊啊啊"
                            })
                        }
                    })
                }
            });

            return ctx.status = 200
        }
    } catch (err) {
        console.error(err)
    }
})

app.use(router.routes())

app.listen(3000)

// 到科學史上的今天抓資料
function crawler(url) {
    return axios.get(url).then(res => {
        if (res.data) {
            const $ = cheerio.load(res.data, {
                decodeEntities: false
            })
            return $("p:contains('科學史上的今天')").html();
        }
        return null;
    })
}

// copy FB官網處理訊息
function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
        senderID, recipientID, timeOfMessage);
    console.log(JSON.stringify(message));

    var messageId = message.mid;

    var messageText = message.text;
    var messageAttachments = message.attachments;

    sendTextMessage(senderID, "Message with attachment received");

}

// copy FB官網處理訊息
async function callSendAPI(messageData) {
    try {
        let response = await axios.post('https://graph.facebook.com/v2.6/me/messages?access_token=' + access_token, {
            messageData
        })

        let recipientId = response.data.recipient_id;
        let messageId = response.data.message_id;

        console.log("Successfully sent generic message with id %s to recipient %s",
            messageId, recipientId);
    } catch (err) {
        console.error(err)
    }
}

// copy FB官網處理訊息
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    console.log(senderID, recipientID)
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

    // When a postback is called, we'll send a message back to the sender to
    // let them know it was successful
    sendTextMessage(senderID, "Postback called");
}

// copy FB官網處理訊息
async function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText
        }
    };

    await callSendAPI(messageData);
}