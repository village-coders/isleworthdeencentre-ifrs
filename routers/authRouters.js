const express = require("express")

const authRouter = express.Router()

const {login, signup, updateUserPassword} = require("../controllers/authController")
const isLoggedIn = require("../middlewares/isLoggedIn")



authRouter.post("/signup", signup)
authRouter.post("/login", login)
authRouter.put("/update-password/:id", isLoggedIn, updateUserPassword)


module.exports = authRouter