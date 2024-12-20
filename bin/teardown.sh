#!/bin/bash

###############################################################################################
# After running pre-teardown.ts, all replicated lambda@edge functions have been deleted.
# However, it seems cloudformation does not "catch up" with that fact until some time 
# after this state has been reached. This script, therefore, will repeate attempts to delete 
# the stack until cloudformation stops complaining about the existence of replicated functions
# preventing the deletion of the "parent" lambda@edge function. This may take a few minutes.
###############################################################################################

# Have stack destroy attempts be repeated for half an hour before giving up
iteration_inverval=10 # Seconds
max_iterations=180

# Loop until the command succeeds or reaches 100 iterations
for ((i = 1; i <= $max_iterations; i++)); do
  echo "Attempt $i..."

  # Create temporary files for stdout and stderr
  temp_stdout=$(mktemp)
  temp_stderr=$(mktemp)

  # TEST: error without "replicated"
  # { { (>&2 echo "An error has been thrown"; false) 1> >(tee "$temp_stdout"); } 2> "$temp_stderr"; }

  # TEST: error WITH "replicated"
  # { { (>&2 echo "An error has been replicated"; false) 1> >(tee "$temp_stdout"); } 2> "$temp_stderr"; }

  # TEST: non-error command
  # { { (ls -la) 1> >(tee "$temp_stdout"); } 2> "$temp_stderr"; }

  # Run the command
  { { (cdk destroy --all -f) 1> >(tee "$temp_stdout"); } 2> "$temp_stderr"; } 

  # Check the exit status of the command
  exit_code=$?

  # Capture the output into variables
  stdout_var=$(<"$temp_stdout")
  stderr_var=$(<"$temp_stderr")

  # Clean up temporary files
  rm "$temp_stdout" "$temp_stderr"
  
  # Check if the command succeeded
  if [[ $exit_code -eq 0 ]]; then
    echo "Stack successfully deleted."
    break
  fi
  
  # Check if it's the anticipated "replicated" error
  if echo "$stderr_var" | grep -iq "replicated"; then
    echo 'It appears cloudfront is still not "aware" that all replicated functions have been deleted.'
  else
    echo "Unexpected error:"$'\n'"$stderr_var"
    exit 1
  fi

  # Check if the maximum iteration count has been reached
  if [[ $i -ge $max_iterations ]]; then
    echo "Reached maximum iterations ($max_iterations). Exiting..."
    exit 1
  fi
  
  # Add a delay between retries
  echo "Trying again in ${iteration_inverval} seconds"
  sleep $iteration_inverval
done

