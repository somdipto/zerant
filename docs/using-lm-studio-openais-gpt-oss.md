# Using LM Studio + OpenAI’s gpt-oss

### STEP1: Setup LMStudio and download **OpenAI GPT-OSS**

1. Download LMStudio from https://lmstudio.ai/ 
    
2. Click on Discover in LMStudio, it should be the “🔍” icon on the left

![Setup LMStudio and download OpenAI GPT-OSS](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step1.png)

3. Search for gpt-oss-20b and click Download

![Search for gpt-oss-20b and click Download](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step2.png)

4. After download finishes, load the model. 

![After download finishes, load the model.](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step3.png)

NOTE: Enable the flag to choose model parameters on load

![Enable the flag to choose model parameters on load](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step4.png)

Set context length to 32768, depending on your hardware and load the model

![Set context length to 32768, depending on your hardware and load the model](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step5.png)

### STEP2: Configure BrowserOS to use LMStudio

1. Add Provider from `chrome://settings/browseros-ai`

![Configure BrowserOS to use LMStudio](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step6.png)

2. Choose Provider Type as “OpenAI Compatible”

![Choose Provider Type as “OpenAI Compatible”](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step7.png)

3. Set Base URL to http://127.0.0.1:1234/v1 and model ID to openai/gpt-oss-20b and set context length to 32768 and save!

![Set Base URL-1](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step8.png)

![Set Base URL-2](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step9.png)

4. Change the default provider to lmstudio and you are good to go!

![Change the default provider to lmstudio](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step10.png)

5. You can gpt-oss from Agent!

![You can gpt-oss from Agent](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step11.png)

If everything is setup you should see messages on the LMStudio, like below.

![If everything is setup you should see messages on the LMStudio](images/using-lm-studio-openais-gpt-oss/lm-studio-openais-step12.png)