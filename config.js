module.exports = {
	
	//TOKEN
	token : "SECRET_TOKE_HERE",
	guildId : "GUILD_ID_HERE",

	//DATABASE
	db : {
			client : 'mysql',
			connection : { 
				host : 'localhost',
				user : 'root',
				password : 'MYSQL_PASSWORD',
				database : 'ghost',
			},
	},

	//ROLES
	roles : {
		devTeam: "342168894838013953",
		moderators: "342169149906092032",
		top10: "342169289270493186",
		top50 : "407854909808181259",
		veteran : "373781016013438977",
		registered : "408301793005797386",
	},
			
	//CHANNELS
	channels : {
		ingamelobbychannel : "368475932228583425",
		suggestionschannel : "381052000592461824",
		botSelfUserID : "368054971062550528",
		wc3logchannel : "405405988959813632",
		robotSpamChannel : "407850964838645770",
		generalchannel : "342167049721610240",
	},

	//BOT OPTIONS
	//Check database for new messaged every X seconds
	SecondsDelayMessagesCheck : 2, 	
	//Select no more that X messages from the Database
	MessageLimitRows : 10,			
	//Maximum amount of characters for Discord message to be sent to Warcraft
	RowCharactersLimit : 210,		
	//Users wont be able to write messages to 'sugestions' channel more often than this amount of minutes
	SuggestionsTimeoutHours : 12, 	
	//Messages that are written in less than (above) minutes will be deleted after this amount of seconds
	SuggestionsDeleteWaitTime : 60,		
	//Base name of in-game-lobby channel
	LobbyChannelBaseName : "in-game_lobby", 
	//Turn message logging to text files on/off (true/false)
	EnableChatLog : true, 
	//Root path where the chat log should be saved (include "/" slash in the end!) MAKE SURE IT EXISTS
	ChatLogRootFolder : "./chatlog/", 
	//Report messages about
	ReportJoinLeaveStartPlayers : true, 
	//Amount of seconds to wait before reporting next game loading. (To make sure we dont report game loading more than once).
	ReportedSafeTime : 20, 
	//Report IPs and hostnames to wc3_log channel (only works when ReportJoinLeaveStartPlayers==true)
	ReportIPs : false, 

	//This will only report join/leave messages of players that typed atleast 'MessagesCountRequired' messages
	StopReportSpamEnable : true, 
	//(read above)
	MessagesCountRequired : 2, 
	//Delete informational messages (about errors mostly) after this amount of seconds
	InfMsgDisplayTimeSec : 30, 
	//Delete commands of users (if not in #spam channel) after this amount of secs
	CommandsDeleteTimeSec : 3, 
	//Period of seconds between Discord Role updates (ranks)
	RolesUpdateTimeSec : 60, 
	//How many hours notification will be Active
	//NotifyTimeActive : 3, 
	//Now many minutes should we wait after notification before sending a new one?
	NotifyTimeRelaxMin : 10, 
	
}