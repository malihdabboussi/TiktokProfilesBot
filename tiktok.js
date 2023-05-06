
const fs = require('fs')
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const { promisify } = require('util')

let timestamp = new Date().valueOf()
const { stringify } = require("csv-stringify");
const { parse } = require("csv-parse");
const client = require('https');
const jimp = require('jimp')
const webp = require('webp-converter');
let original_account =[]

require('events').EventEmitter.prototype._maxListeners = 100;
puppeteer.use(require('puppeteer-extra-plugin-anonymize-ua')())
puppeteer.use(StealthPlugin())


fs.writeFileSync('./tiktok_result.csv',"original Account,fake Account,percentage,status\n")
let readStream = fs.createReadStream('./accounts.csv')
let writeStream = fs.createWriteStream("./tiktok_result.csv", { flags: "a" })



const columns = [
    "original account",
    "fake account",
    "percentage",
    "status"
]
const stringifier = stringify({ header: false, columns: columns });
let page

/**
 * Read Accounts from accounts.csv
 * @param {*} path
 * @returns
 */
function getAccounts(path) {
    return new Promise(async resolve => {
        let accounts = []
        readStream.pipe(parse({ delimiter: ",", from_line: 2 }))
            .on("data", function (row) {
                // Console(row);
                Console(row[0])
                accounts.push(row[0])
            })
            .on("end", function () {
                Console("finished");
                resolve(accounts)
            })
            .on("error", function (error) {
                Console(error.message);
            });
    })

}

function sleep(ms) {
    return new Promise(resolve => { setTimeout(resolve, ms) })
}


/**
 * Loding
 * @param {*} accounts
 * @returns
 */
async function loadPuppeteer(accounts) {
    return new Promise(async resolve => {

        try {
           Console(`Loading first Account , need to solve GeeTest`)
            const browser = await puppeteer.launch({ headless: false });
             page = await browser.newPage({ headless: true, defaultViewport: { width: 1920, height: 1080 } });
            await page.goto(`https://www.tiktok.com/search/user?q=${accounts[0]}&t=${timestamp}`)
            await page.waitForSelector('#main-content-search_user')
            await responseWatcher(accounts[0])
            await sleep(500)
            await ManageAccounts(accounts)
        } catch (e) {
            Console('Error : '+ e)
        }
    })


}

async function ManageAccounts(accounts) {

    for (var i = 1; i < accounts.length; i++){
        await sleep(1000)
        await replaceAccount(accounts[i])
    }
    process.exit()
}


function replaceAccount(account) {
    return new Promise(async resolve => {
        await page.goto(`https://www.tiktok.com/search/user?q=${account}&t=${timestamp}`)
        await responseWatcher(account)
        resolve('done')
    })

}


/**
 * response watcher will get data from response per earch account , and will proceed to get the original account
 * and will compare each account with the original
 * @param {*} account getting account response data
 *
 */
function responseWatcher(account) {
    Console('Monitoing Response')
    return new Promise(async resolve => {
        await page.on('response', async (response) => {
            try{
            const request = response.request();
            let url = request.url().toString()
            if (url.includes('https://www.tiktok.com/api/search/user/full/?') && url.includes(encodeURI(account))) {
                const text = await response.text();
                let parsed = JSON.parse(text)
                await parseOriginalAccount(parsed)
                await compareAccounts(parsed)
                resolve('done')
            }
            } catch (e) { Console(`Error response `+ e) }
        })
    })

}


/**
 * will compare two accounts , original and the second account
 * @param {*} data
 * @returns
 */
function compareAccounts(data) {
    return new Promise(async resolve => {
        let percentage_result = []
        let _array = []
        let percentag

        let status = false // true = fake, false = not fake

        for (var i = 1; i < data.user_list.length; i++) {
            percentag = 0
            let path = data['user_list'][i]['user_info']
            if (original_account[0]['id'] != path['unique_id']) {
                percentag = percentag + 10
            }

            if (original_account[0]['nickname'] != path['nickname']) {
                percentag = percentag + 15
            }

            if (original_account[0]['signature'] != path['signature']) {
                percentag = percentag + 25
            }
            let url = path['avatar_thumb']['url_list'][0]
            url.replaceAll('\u0026', "&")
            // Console(url)
            let downloaded = await downloadImages(url, './image2.webp')
            await sleep(1000)
            if (downloaded == 'done') {
                await convertImage('image2.webp')
            }


            let compare = await compareImages('./originalImage.png', './image2.png')

            if (compare == false) {
                percentag = percentag + 50
            }

            if (percentag >= 60) {
                status = true
            } else if(percentag == 50) {
                status = false
            }

            percentage_result.push({ original: original_account[0]['id'], account: path['unique_id'], 'percentag': percentag, 'status': status })
            editCSV([percentage_result[0].original, path['unique_id'], percentag, status])
        }


        // Console(percentage_result)
        resolve('done')
    })



}


function editCSV(data) {
    writeStream.write(data + "\n");
    stringifier.pipe(writeStream)
    Console("finished writing to CSV");
}


/**
 *will fetch the original data and store it in original_account for later comparison to save data and enhance speed
 * @param {*} data response data from response watcher
 *
 */
function parseOriginalAccount(data) {
     Console('Fetching Original Account')
    return new Promise(async resolve => {
        original_account=[]
        fs.writeFileSync('accounts.json', JSON.stringify(data))
        for (var i = 0; i < data.user_list.length; i++) {
            let path = data['user_list'][i]['user_info']
            if (path['custom_verify'] !='' ) {
                original_account.push({ 'name': path['nickname'], 'id': path['unique_id'], 'bio': path['signature'] })
                let url = path['avatar_thumb']['url_list'][0]
                url.replaceAll('\u0026', "&")
                // Console(url)
                let downloaded = await downloadImages(url, './originalImage.webp')
                await sleep(1000)
                if (downloaded == 'done') {
                    Console('Original Image downloaded')
                    await convertImage('originalImage.webp')
                }
            }
        }
        // Console(original_account)
        resolve()
    })

}

/**
 * will download the account image
 * @param {*} url
 * @param {*} path
 * @returns
 */
function downloadImages(url, path) {
    return new Promise(resolve => {
        client.get(url, (res, err) => {
            // Console(res)
            if (err) {
                Console('err '+ err)
                resolve('error')
            }
            Console('donwloaded')
            res.pipe(fs.createWriteStream(path));
            resolve('done')
        });
})

}

/**
 *
 * @param {*} image1 original image path
 * @param {*} image2 secondary image path
 * @returns if true for matched images , false for not matched iamges
 */
async function compareImages(_image1,_image2) {
    let image1 =await jimp.read(_image1)
    let image2 = await jimp.read(_image2)

    //hash
    const image1Hash = image1.hash()
    const image2Hash = image2.hash()

    //distance

    const distance = await jimp.distance(image1, image2)

    //diff
    const diff = jimp.diff(image1, image2)

    if (image1Hash !== image2Hash || distance > 0.15 || diff > 0.15) {
        Console(`image compare : don't match`)
        return false // false dose't match
    } else {
        Console(`image compare : matched`)
        return true
    }

}

/**
 * convert images from webp format to png format
 * @param {*} path image path format
 * @returns png format
 */
function convertImage(path) {
    Console('Converting image')
    return new Promise(resolve => {
        const result = webp.dwebp(path, path.replace('webp', 'png'), "-o", logging = "-v");
        result.then((response) => {
            // Console(response);
            Console('Conversion completed')
            resolve('done')
        }).catch(err => {
            Console('conversion error ' + err)
        })
    })

}


/**
 * Custom Console log
 * @param {*} message
 */
function Console(message) {
    let time = Time()
    console.log(`[${time.minutes}:${time.seconds}] ${message}`)
}

function Time() {
    let time = new Date()
    return {minutes : time.getMinutes(), seconds:time.getSeconds()}
}


(async ()=>  {
    try {
        let accounts = await getAccounts('./accounts.csv')
         await loadPuppeteer(accounts)

    } catch (e) {
        Console('Run : '+ e)
    }
})()


